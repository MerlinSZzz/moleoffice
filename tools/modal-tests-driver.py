# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
"""Read a runner plan, perform Modal calls, and print the result last."""
import json
import sys
import threading
import time

import modal
from modal.exception import SandboxFilesystemNotFoundError, SandboxFilesystemFileTooLargeError


def run(plan):
    sandbox = None
    started = None
    stopped_output = threading.Event()
    output_lock = threading.Lock()
    result = {"kind": "modal-tests-result", "reportFile": None, "sandboxId": None,
              "sandboxSeconds": 0, "stoppedAtLimit": False}
    operation = "preparing the image"
    try:
        image = modal.Image.from_dockerfile(plan["dockerfilePath"], context_dir=plan["contextPath"], add_python="3.12")
        image = image.run_commands("apt-get update", "apt-get install -y --no-install-recommends tini")
        image = image.add_local_file(plan["tarPath"], "/opt/mole-office-snapshot.tar", copy=True)
        image = image.run_commands(
            "mkdir -p /srv/sandbox/work /srv/sandbox/home",
            "tar -xf /opt/mole-office-snapshot.tar -C /srv/sandbox/work",
            "rm /opt/mole-office-snapshot.tar",
            "chown -R 1000:1000 /srv/sandbox",
            "cd /srv/sandbox/work/mole-office && setpriv --reuid=1000 --regid=1000 --clear-groups env HOME=/srv/sandbox/home npm ci --no-audit --no-fund",
            # Modal's run_commands layers leave /tmp at 777 (measured 11 Oct 2026); the container has 1777.
            'chmod 1777 /tmp && test "$(stat -c %a /tmp)" = 1777')
        app = modal.App.lookup("mole-office-tests", create_if_missing=True)
        operation = "starting the VM sandbox"
        sandbox = modal.Sandbox.create(app=app, image=image, runtime="vm", block_network=True,
                                       cpu=plan["cpu"], memory=plan["memoryMiB"], timeout=plan["limitSeconds"] + 600)
        started = time.monotonic()
        result["sandboxId"] = sandbox.object_id
        operation = "reading the sandbox hostname"
        host = sandbox.exec("hostname")
        hostname = host.stdout.read().strip()
        host.wait()
        if host.returncode != 0 or not hostname or any(c.isspace() for c in hostname):
            raise RuntimeError("The sandbox hostname could not be read.")
        operation = "setting the sandbox host lookup"
        hosts = sandbox.filesystem.read_text("/etc/hosts")
        sandbox.filesystem.write_text(hosts + "\n127.0.1.1 " + hostname + "\n", "/etc/hosts")

        def execute(command):
            process = sandbox.exec(*command, workdir=plan["checkout"])
            readers = []
            wait_errors = []
            for pipe in (process.stdout, process.stderr):
                def stream(source=pipe):
                    try:
                        for line in source:
                            with output_lock:
                                if stopped_output.is_set():
                                    return
                                print(line, end="" if line.endswith("\n") else "\n", flush=True)
                    except Exception as error:
                        wait_errors.append(error)
                reader = threading.Thread(target=stream, daemon=True)
                reader.start()
                readers.append(reader)
            def wait():
                try:
                    process.wait()
                except Exception as error:
                    wait_errors.append(error)
            waiter = threading.Thread(target=wait, daemon=True)
            waiter.start()
            waiter.join(max(0, plan["limitSeconds"] - (time.monotonic() - started)))
            if waiter.is_alive():
                result["stoppedAtLimit"] = True
                diagnostic = sandbox.exec("ps", "-eo", "pid,ppid,etimes,pcpu,rss,args")
                result["ps"] = diagnostic.stdout.read()
                diagnostic.wait()
                print(result["ps"], flush=True)
                return False
            for reader in readers:
                reader.join()
            if wait_errors:
                raise wait_errors[0]
            return process.returncode == 0

        operation = "building the checkout"
        if execute(plan["buildCommand"]):
            operation = "running the tests"
            execute(plan["command"])
        operation = "reading the Vitest report"
        try:
            try:
                sandbox.filesystem.copy_to_local(plan["reportPath"], plan["reportFile"])
            except SandboxFilesystemFileTooLargeError:
                report = sandbox.exec("cat", plan["reportPath"])
                with open(plan["reportFile"], "w", encoding="utf-8") as destination:
                    for chunk in report.stdout:
                        destination.write(chunk)
                report.wait()
                if report.returncode != 0:
                    raise RuntimeError("The report copy failed.")
            result["reportFile"] = plan["reportFile"]
        except SandboxFilesystemNotFoundError:
            pass
    except Exception as error:
        print("Modal tests driver failed while " + operation + " (" + type(error).__name__ + ").", flush=True)
    finally:
        with output_lock:
            stopped_output.set()
        if sandbox is not None:
            try:
                sandbox.terminate()
            except Exception as error:
                result["reportFile"] = None
                print("Modal tests could not terminate the sandbox (" + type(error).__name__ + ").", flush=True)
            finally:
                result["sandboxSeconds"] = time.monotonic() - started
    return result


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as source:
        plan = json.load(source)
    print(json.dumps(run(plan)), flush=True)
