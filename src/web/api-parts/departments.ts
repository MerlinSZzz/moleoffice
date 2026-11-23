// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s. The browser's doors to the departments of a project: one page of the tree, one department with its
// history, and the two writes the person makes by a press (src/server/api/departments.ts).
import { json, request } from '../api.ts'
import type { ADepartmentWritten, DepartmentData, OneDepartment, TheDepartments } from '@shared/departments.ts'

export const departmentsDoors = {
  /** One page of the top departments, each with every department under it. Left out, `limit` is the door's own. */
  departments: (offset = 0, limit?: number) =>
    request<TheDepartments>(`/api/departments?offset=${String(offset)}${limit === undefined ? '' : `&limit=${String(limit)}`}`),
  /** One department, the departments directly under it, and its history. */
  department: (id: string) => request<OneDepartment>(`/api/departments/${encodeURIComponent(id)}`),
  /** Files a department. */
  fileADepartment: (department: DepartmentData) => request<ADepartmentWritten>('/api/departments', { method: 'POST', body: json(department) }),
  /** Writes one department whole: a field left out of `department` is removed. */
  writeADepartment: (id: string, department: DepartmentData) =>
    request<ADepartmentWritten>(`/api/departments/${encodeURIComponent(id)}`, { method: 'PUT', body: json(department) }),
}
