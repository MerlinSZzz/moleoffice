// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach,expect,it,vi } from 'vitest'
import { NativeStandingReader,inlineLookMask } from '../src/look-native.ts'
import type { SpriteFrame } from '../src/pack.ts'
const frame:SpriteFrame={atlas:'generated',rect:[10,20,3,2],size:[128,128],trim:[4,5,3,2],anchor:[64,110]}
afterEach(()=>vi.unstubAllGlobals())
function fixture(error=0,available=true) {
  const raw=new Uint8Array([20,30,40,128,1,2,3,255,7,8,9,0,40,50,60,255,5,6,7,255,0,0,0,0])
  const bitmap={width:3,height:2,close:vi.fn()},texture={},framebuffer={},loseContext=vi.fn()
  const gl={TEXTURE_2D:1,UNPACK_PREMULTIPLY_ALPHA_WEBGL:2,UNPACK_COLORSPACE_CONVERSION_WEBGL:3,NONE:4,UNPACK_FLIP_Y_WEBGL:5,TEXTURE_MIN_FILTER:6,TEXTURE_MAG_FILTER:7,NEAREST:8,TEXTURE_WRAP_S:9,TEXTURE_WRAP_T:10,CLAMP_TO_EDGE:11,RGBA:12,UNSIGNED_BYTE:13,FRAMEBUFFER:14,COLOR_ATTACHMENT0:15,FRAMEBUFFER_COMPLETE:16,NO_ERROR:0,
    createTexture:vi.fn(()=>texture),createFramebuffer:vi.fn(()=>framebuffer),bindTexture:vi.fn(),pixelStorei:vi.fn(),texParameteri:vi.fn(),texImage2D:vi.fn(),bindFramebuffer:vi.fn(),framebufferTexture2D:vi.fn(),checkFramebufferStatus:vi.fn(()=>16),
    readPixels:vi.fn((_x,_y,_w,_h,_format,_type,out:Uint8Array)=>out.set(raw)),getError:vi.fn(()=>error),deleteFramebuffer:vi.fn(),deleteTexture:vi.fn(),getExtension:vi.fn(()=>({loseContext}))}
  const canvas={width:0,height:0,getContext:vi.fn(()=>available?gl:null)}
  vi.stubGlobal('document',{createElement:vi.fn(()=>canvas)});vi.stubGlobal('createImageBitmap',vi.fn(async()=>bitmap))
  return {raw,bitmap,gl,canvas,loseContext}
}
it('reads straight native crops with no blend, preserves untrimmed origins, and releases native resources',async()=> {
  const f=fixture(),reader=new NativeStandingReader(),image={} as HTMLImageElement,signal=new AbortController().signal
  const actual=await reader.read(image,frame,signal)
  expect(createImageBitmap).toHaveBeenCalledWith(image,10,20,3,2,{premultiplyAlpha:'none',colorSpaceConversion:'none'})
  expect([...actual.slice((5*128+4)*4,(5*128+7)*4)]).toEqual([20,30,40,128,1,2,3,255,0,0,0,0])
  expect([...actual.slice((6*128+4)*4,(6*128+7)*4)]).toEqual([...f.raw.slice(12)])
  expect(f.canvas.getContext).toHaveBeenCalledWith('webgl',{alpha:true,premultipliedAlpha:false,depth:false,stencil:false,antialias:false,preserveDrawingBuffer:false})
  expect(f.gl.pixelStorei).toHaveBeenCalledWith(f.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false)
  expect(f.bitmap.close).toHaveBeenCalledTimes(1);expect(f.gl.deleteTexture).toHaveBeenCalledTimes(1);expect(f.gl.deleteFramebuffer).toHaveBeenCalledTimes(1)
  await reader.read(image,frame,signal);expect(f.canvas.getContext).toHaveBeenCalledTimes(1)
  reader.release();expect(f.loseContext).toHaveBeenCalledTimes(1);expect([f.canvas.width,f.canvas.height]).toEqual([1,1])
})
it('releases bitmap and texture on GL failure, unavailable contexts and cancellation',async()=> {
  const f=fixture(1),reader=new NativeStandingReader(),signal=new AbortController().signal
  await expect(reader.read({} as HTMLImageElement,frame,signal)).rejects.toThrow('readback failed')
  expect(f.bitmap.close).toHaveBeenCalledOnce();expect(f.gl.deleteTexture).toHaveBeenCalledOnce();expect(f.gl.deleteFramebuffer).toHaveBeenCalledOnce();reader.release()
  const unavailable=fixture(0,false),missing=new NativeStandingReader()
  await expect(missing.read({} as HTMLImageElement,frame,signal)).rejects.toThrow('unavailable');expect(unavailable.bitmap.close).toHaveBeenCalledOnce();missing.release()
  const pending=fixture(),cancelled=new NativeStandingReader(),controller=new AbortController()
  let finish:((b:typeof pending.bitmap)=>void)|undefined
  vi.stubGlobal('createImageBitmap',()=>new Promise(resolve=>{finish=resolve}))
  const read=cancelled.read({} as HTMLImageElement,frame,controller.signal);controller.abort();cancelled.release();finish!(pending.bitmap)
  await expect(read).rejects.toThrow('cancelled');expect(pending.bitmap.close).toHaveBeenCalledOnce();expect(pending.canvas.getContext).not.toHaveBeenCalled()
})
it('decodes permitted inline mask bytes locally and rejects fetch URLs and aborted masks',async()=> {
  expect([...await inlineLookMask('data:image/png;base64,AQIDAA==',new AbortController().signal)]).toEqual([1,2,3,0])
  await expect(inlineLookMask('generated-mask.png',new AbortController().signal)).rejects.toThrow('inline mask')
  const abort=new AbortController();abort.abort();await expect(inlineLookMask('data:image/png;base64,AQID',abort.signal)).rejects.toThrow('inline mask')
})
