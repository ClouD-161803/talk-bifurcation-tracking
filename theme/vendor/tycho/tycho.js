/*! TyCHO runtime 0.3.0, Apache-2.0, https://github.com/beeson-group/tycho
 * This bundle contains:
 * mp4-muxer 5.2.2, MIT, Copyright 2023 Vanilagy, https://github.com/Vanilagy/mp4-muxer
 * three 0.187.0, MIT, Copyright 2010-2026 three.js authors, https://github.com/mrdoob/three.js
 * Full license texts: https://github.com/beeson-group/tycho/blob/main/THIRD_PARTY_NOTICES.md */
"use strict";var tycho=(()=>{var Ph=Object.defineProperty;var e0=Object.getOwnPropertyDescriptor;var t0=Object.getOwnPropertyNames;var n0=Object.prototype.hasOwnProperty;var i0=(n,e)=>{for(var t in e)Ph(n,t,{get:e[t],enumerable:!0})},r0=(n,e,t,i)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of t0(e))!n0.call(n,r)&&r!==t&&Ph(n,r,{get:()=>e[r],enumerable:!(i=e0(e,r))||i.enumerable});return n};var s0=n=>r0(Ph({},"__esModule",{value:!0}),n);var yT={};i0(yT,{Container:()=>qr,DATA_VERSION:()=>jr,EXPORT_LIMITS:()=>wu,SCENE_MAJOR:()=>yr,SCENE_MINOR:()=>Qs,TychoError:()=>Qt,TychoViewerElement:()=>ba,colormap:()=>Mr,colormapCss:()=>ep,decodeEmbedded:()=>_a,define:()=>Ah,evaluate:()=>Qf,exportVideo:()=>gT,formatNumber:()=>Yi,sizePreset:()=>_o,validate:()=>Va});var Qt=class extends Error{rule;constructor(e,t){super(`[${e}] ${t}`),this.name="TychoError",this.rule=e}};function T(n,e){throw new Qt(n,e)}var jr=2,o0=[84,89,67,68],Zs=12,If={raw:new Set(["dtype","shape","encoding","offset","length"]),"shuffle-delta-deflate":new Set(["dtype","shape","encoding","chunk_rows","chunks"])},Yr={int8:Int8Array,uint8:Uint8Array,int16:Int16Array,uint16:Uint16Array,int32:Int32Array,uint32:Uint32Array,float32:Float32Array,float64:Float64Array},Lf=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;function a0(n){return typeof n=="string"&&Object.hasOwn(Yr,n)}function Xr(n){return Yr[n].BYTES_PER_ELEMENT}var Ks=n=>Number.isSafeInteger(n)&&n>=0,Ih=n=>n!==null&&typeof n=="object"&&!Array.isArray(n);function l0(n,e,t,i){let r=new Yr[i](t),s=Xr(i),o={int8:a=>n.getInt8(a),uint8:a=>n.getUint8(a),int16:a=>n.getInt16(a,!0),uint16:a=>n.getUint16(a,!0),int32:a=>n.getInt32(a,!0),uint32:a=>n.getUint32(a,!0),float32:a=>n.getFloat32(a,!0),float64:a=>n.getFloat64(a,!0)}[i];for(let a=0;a<t;a++)r[a]=o(e+a*s);return r}async function c0(n,e,t){let i=e.length,r=new DecompressionStream("deflate"),s=r.writable.getWriter();s.write(n).catch(()=>{}),s.close().catch(()=>{});let o=r.readable.getReader(),a=0;try{for(;;){let{done:l,value:c}=await o.read();if(l)break;a+c.length>i&&(o.cancel().catch(()=>{}),T("shuffle-delta-deflate",`${t} inflates to more than the ${i} bytes of its rows`)),e.set(c,a),a+=c.length}}catch(l){if(l instanceof Qt)throw l;let c=l.message;T("shuffle-delta-deflate",`${t} does not inflate${c?`: ${c}`:""}`)}a!==i&&T("shuffle-delta-deflate",`${t} inflates to ${a} bytes, not the ${i} of its rows`)}function h0(n,e,t,i,r,s){let o=e*t;if(i===1){let a=new Uint8Array(r,s,o);a.set(n.subarray(0,Math.min(t,o)));for(let l=t;l<o;l++)a[l]=n[l]+a[l-t]}else if(i===2){let a=new Uint16Array(r,s,o);for(let l=0;l<o;l++){let c=n[l]|n[o+l]<<8;a[l]=l<t?c:c+a[l-t]}}else if(i===4){let a=new Uint32Array(r,s,o),l=2*o,c=3*o;for(let h=0;h<o;h++){let u=(n[h]|n[o+h]<<8|n[l+h]<<16|n[c+h]<<24)>>>0;a[h]=h<t?u:u+a[h-t]}}else{let a=new Uint32Array(r,s,2*o),l=Lf?0:1,c=1-l;for(let h=0;h<o;h++){let u=(n[h]|n[o+h]<<8|n[2*o+h]<<16|n[3*o+h]<<24)>>>0,f=(n[4*o+h]|n[5*o+h]<<8|n[6*o+h]<<16|n[7*o+h]<<24)>>>0;if(h>=t){let d=2*(h-t);u+=a[d+l],f+=a[d+c]+(u>4294967295?1:0)}a[2*h+l]=u,a[2*h+c]=f}}}function u0(n){return Math.min(n.chunk_rows,n.shape[0])*n.shape.slice(1).reduce((e,t)=>e*t,1)*Xr(n.dtype)}async function d0(n,e,t,i){let r=Xr(e.dtype),s=e.shape[0],o=e.shape.slice(1).reduce((l,c)=>l*c,1),a=new ArrayBuffer(s*o*r);for(let[l,[c,h]]of e.chunks.entries()){let u=l*e.chunk_rows,f=Math.min(e.chunk_rows,s-u),d=i.subarray(0,f*o*r);await c0(t.subarray(c,c+h),d,`chunk ${l} of array ${n}`),h0(d,f,o,r,a,u*o*r)}return new Yr[e.dtype](a,0,s*o)}function f0(n,e,t){Ih(e)||T("container",`array ${n} is not an object`);let i=typeof e.encoding=="string"&&Object.hasOwn(If,e.encoding)?If[e.encoding]:null;i===null&&T("array-keys",`array ${n} has encoding ${JSON.stringify(e.encoding)}, which this reader does not know`);let r=Object.keys(e).filter(h=>!i.has(h));r.length>0&&T("array-keys",`array ${n} has keys ${r.sort().join(", ")} that this reader does not know`);let s=[...i].filter(h=>!Object.hasOwn(e,h));s.length>0&&T("array-keys",`array ${n} lacks the keys ${s.join(", ")}`),a0(e.dtype)||T("array-dtype",`array ${n} has dtype ${JSON.stringify(e.dtype)}, not one of ${Object.keys(Yr).join(", ")}`);let o=e.shape;(!Array.isArray(o)||o.length===0||!o.every(Ks))&&T("array-keys",`array ${n} has shape ${JSON.stringify(o)}, not a nonempty list of counts`);let a=o.reduce((h,u)=>h*u,1)*Xr(e.dtype);if(Number.isSafeInteger(a)||T("array-keys",`array ${n} has shape [${o.join(", ")}], which is too large`),e.encoding==="raw"){(!Ks(e.offset)||!Ks(e.length))&&T("array-keys",`array ${n} has an offset or a length that is not a count`),e.offset%8!==0&&T("array-keys",`array ${n} starts at byte ${e.offset}, which is not a multiple of 8`),e.length!==a&&T("array-keys",`array ${n} has length ${e.length}, while shape [${o.join(", ")}] of ${e.dtype} takes ${a} bytes`),e.offset+e.length>t&&T("array-keys",`array ${n} runs past the end of the file, at bytes ${e.offset} to ${e.offset+e.length} of the payload`);return}let l=e.chunk_rows;(!Ks(l)||l<1)&&T("shuffle-delta-deflate",`array ${n} has chunk_rows ${JSON.stringify(l)}, not a positive integer`),Array.isArray(e.chunks)||T("shuffle-delta-deflate",`the chunks of array ${n} are not a list`);let c=Math.ceil(o[0]/l);e.chunks.length!==c&&T("shuffle-delta-deflate",`array ${n} has ${e.chunks.length} chunks, while ${o[0]} rows in chunks of ${l} take ${c}`),e.chunks.forEach((h,u)=>{(!Array.isArray(h)||h.length!==2||!h.every(Ks))&&T("shuffle-delta-deflate",`chunk ${u} of array ${n} is not an [offset, length] pair of counts`),h[0]+h[1]>t&&T("shuffle-delta-deflate",`chunk ${u} of array ${n} runs past the end of the file`)})}var qr=class n{header;bytes;payloadStart;cache=new Map;constructor(e,t,i){this.header=e,this.bytes=t,this.payloadStart=i}static async parse(e){let t=ArrayBuffer.isView(e)?new DataView(e.buffer,e.byteOffset,e.byteLength):new DataView(e),i=t.byteLength;(i<Zs||o0.some((u,f)=>t.getUint8(f)!==u))&&T("container",'the bytes are not a TyCHO data container, since they lack the 12-byte preamble that starts with the magic "TYCD"');let r=t.getUint32(4,!0);r!==jr&&T("container-version",`data container version ${r} is not supported, since this reader reads only version ${jr}`);let s=t.getUint32(8,!0);Zs+s>i&&T("container",`the header length ${s} runs past the end of the file`);let o;try{let u=new TextDecoder("utf-8",{fatal:!0,ignoreBOM:!0}).decode(new Uint8Array(t.buffer,t.byteOffset+Zs,s));o=JSON.parse(u)}catch(u){T("container",`the header is not JSON: ${u.message}`)}(o===null||typeof o!="object")&&T("container","the header is not a JSON object"),o.format!=="tycho-data"&&T("container",`header format is ${JSON.stringify(o.format)}, not "tycho-data"`),o.version!==jr&&T("container-version",`header version ${JSON.stringify(o.version)} is not supported, since this reader reads only version ${jr}`),o.generator!==void 0&&typeof o.generator!="string"&&T("container","the header generator is not a string"),o.meta!==void 0&&!Ih(o.meta)&&T("container","the header meta is not an object"),Ih(o.arrays)||T("container",'the header lacks an "arrays" object');let a=Zs+s+(8-(Zs+s)%8)%8,l=Math.max(0,i-a);for(let[u,f]of Object.entries(o.arrays))f0(u,f,l);let c=new n(o,t,a),h=Object.entries(o.arrays).filter(u=>u[1].encoding==="shuffle-delta-deflate");if(h.length>0){typeof DecompressionStream>"u"&&T("shuffle-delta-deflate","this runtime lacks DecompressionStream, which encoded arrays need");let u=new Uint8Array(t.buffer,t.byteOffset+a,l),f=new Uint8Array(Math.max(...h.map(([,d])=>u0(d))));for(let[d,p]of h){let y=await d0(d,p,u,f);c.cache.set(d,{name:d,dtype:p.dtype,shape:[...p.shape],data:y})}}return c}has(e){return Object.hasOwn(this.header.arrays,e)}names(){return Object.keys(this.header.arrays)}array(e){let t=this.cache.get(e);if(t)return t;this.has(e)||T("trajectory-set",`the data container lacks array ${JSON.stringify(e)}`);let i=this.header.arrays[e],r=i.length/Xr(i.dtype),s=this.bytes.byteOffset+this.payloadStart+i.offset,o=Lf&&s%Xr(i.dtype)===0?new Yr[i.dtype](this.bytes.buffer,s,r):l0(this.bytes,this.payloadStart+i.offset,r,i.dtype),a={name:e,dtype:i.dtype,shape:[...i.shape],data:o};return this.cache.set(e,a),a}};function p0(n){let e=atob(n.replace(/\s+/g,"")),t=new Uint8Array(new ArrayBuffer(e.length));for(let i=0;i<e.length;i++)t[i]=e.charCodeAt(i);return t}function _a(n,e="base64"){return e!=="base64"&&T("container",`data encoding ${e} is not base64`),p0(n)}var yr=0,Qs=5,Df=new Set(["frames.origin_channel","layers.arrows","layers.read_from","layers.inset_box","clock.keyframes","layers.clock","camera.keyframes","layers.label","layers.points"]),kf=new Set(["format","version","requires","generator","title","theme","frames","bodies","trajectory_sets","inputs","clock","panels","controls","readouts","initial","steps","overlays"]),Sa=/^[A-Za-z0-9_.-]+$/,st="@index",Si="@index";var eo=8,Lh=["linear","smooth","in","out","in-out","hold"];function Ct(n){return n.seconds??eo*(n.revolutions??1)}function Hn(n,e){return e*Ct(n)}function Nf(n,e){switch(n??"linear"){case"linear":return e;case"smooth":return e*e*(3-2*e);case"in":return e*e*e;case"out":{let t=1-e;return 1-t*t*t}case"in-out":{if(e<.5)return 4*e*e*e;let t=2-2*e;return 1-t*t*t/2}case"hold":return 0;default:return T("ease",`the ease ${JSON.stringify(n)} is not one of ${Lh.join(", ")}`)}}function li(n,e,t=i=>typeof i=="number"&&Number.isFinite(i)){(!Array.isArray(n)||n.length===0)&&T("keyframes",`${e} has keyframes ${JSON.stringify(n)}, not a list of at least one keyframe`);let i=-1/0;for(let r of n){(!Array.isArray(r)||r.length<2||r.length>3)&&T("keyframes",`${e} has a keyframe ${JSON.stringify(r)}, not [t, v] or [t, v, ease]`);let s=r[0];(typeof s!="number"||!Number.isFinite(s))&&T("keyframes",`${e} has a keyframe at ${JSON.stringify(s)}, not a finite time`),s<i&&T("keyframes",`${e} has keyframes whose times decrease, from ${i} to ${s}`),i=s,t(r[1])||T("keyframes",`${e} has a keyframe whose value is ${JSON.stringify(r[1])}`),r.length===3&&(typeof r[2]!="string"||!Lh.includes(r[2]))&&T("ease",`${e} has a keyframe whose ease is ${JSON.stringify(r[2])}, not one of ${Lh.join(", ")}`)}return n}function Of(n,e,t,i){let r=-1,s=0,o=e-1;for(;s<=o;){let l=s+o>>1;n(l)<=t?(r=l,s=l+1):o=l-1}if(r<0)return{i:0,e:null};if(r===e-1)return{i:r,e:null};let a=(t-n(r))/(n(r+1)-n(r));return{i:r,e:Nf(i(r+1),a)}}function Jr(n,e){let{i:t,e:i}=Of(s=>n[s][0],n.length,e,s=>n[s][2]),r=n[t][1];return i===null?r:r+i*(n[t+1][1]-r)}function to(n,e,t){return n===void 0?t:typeof n=="number"?n:Jr(n.keyframes,e)}function sn(n,e,t=1){return Math.min(1,Math.max(0,to(n,e,t)))}function no(n,e,t){return Math.max(0,to(n,e,t))}function bn(n,e,t,i="panel"){if(n!==void 0){if(typeof n=="number"){t(n)||T(i,`${e} is ${n}`);return}(n===null||typeof n!="object"||!("keyframes"in n))&&T(i,`${e} is ${JSON.stringify(n)}, not a number or {keyframes}`),li(n.keyframes,e,t)}}var Vn=n=>typeof n=="number"&&n>=0&&n<=1,Ma=n=>typeof n=="number"&&n>=0&&n<=1,Hi=n=>typeof n=="number"&&Number.isFinite(n)&&n>0;function wa(n,e){if(n.keyframes!==void 0)return n.range!==void 0&&T("clock-keyframes","the clock has both a range and keyframes"),Jr(n.keyframes,Hn(n,e));n.range===void 0&&T("clock-mode","the clock is in epoch mode but does not have a range of two numbers or keyframes");let[t,i]=n.range;return t+e*(i-t)}function Zr(n){return n.plane==="xz"?[0,2]:n.plane==="yz"?[1,2]:[0,1]}function Ff(n,e,t){let{i,e:r}=Of(h=>n[h].at,n.length,e,h=>n[h].ease),s=n[i],o=t(i);if(o===null)return null;if(r===null)return{center:o,width:s.width,height:s.height??null};let a=n[i+1],l=t(i+1);if(l===null)return null;let c=(h,u)=>Math.exp((1-r)*Math.log(h)+r*Math.log(u));return{center:[(1-r)*o[0]+r*l[0],(1-r)*o[1]+r*l[1]],width:c(s.width,a.width),height:s.height!==void 0&&a.height!==void 0?c(s.height,a.height):null}}function Ea(n,e,t){(!Array.isArray(n)||n.length===0)&&T("camera-keyframes",`${t} has keyframes ${JSON.stringify(n)}, not a list of at least one camera keyframe`);let i=-1/0,r=0;for(let s of n){(s===null||typeof s!="object")&&T("camera-keyframes",`${t} has a keyframe ${JSON.stringify(s)}, not an object`),(typeof s.at!="number"||!Number.isFinite(s.at))&&T("camera-keyframes",`${t} has a keyframe at ${JSON.stringify(s.at)}, not a finite time`),s.at<i&&T("camera-keyframes",`${t} has keyframes whose times decrease, from ${i} to ${s.at}`),i=s.at,Hi(s.width)||T("camera-keyframes",`${t} has a keyframe of width ${JSON.stringify(s.width)}, not a positive number`),s.height!==void 0&&(e||T("camera-keyframes",`${t} has a keyframe with a height, which only a camera of free aspect takes`),Hi(s.height)||T("camera-keyframes",`${t} has a keyframe of height ${JSON.stringify(s.height)}, not a positive number`),r++);for(let o of[s.center,s.offset])o!==void 0&&!(Array.isArray(o)&&o.length===2&&o.every(a=>typeof a=="number"&&Number.isFinite(a)))&&T("camera-keyframes",`${t} has a keyframe whose center or offset is ${JSON.stringify(o)}, not two finite numbers`);if(s.follow===void 0&&s.center===void 0&&T("camera-keyframes",`${t} has a keyframe with neither a center nor follow targets`),s.follow!==void 0){(!Array.isArray(s.follow)||s.follow.length===0)&&T("camera-keyframes",`${t} has a keyframe whose follow is not a list of targets`);for(let o of s.follow)(o===null||typeof o!="object"||!Number.isInteger(o.layer)||o.layer<0||!Number.isInteger(o.member)||o.member<0)&&T("camera-keyframes",`${t} has a follow target ${JSON.stringify(o)}, not {layer, member} of two nonnegative integers`)}s.ease!==void 0&&Nf(s.ease,0)}r!==0&&r!==n.length&&T("camera-keyframes",`${t} gives a height in some keys but not in all`)}function Bf(n,e){return Number.isInteger(e)||T("clock",`the frame index ${String(e)} is not an integer`),(!Number.isInteger(n)||n<1)&&T("clock",`the clock has frame_count ${String(n)}, not a count of at least one`),(e%n+n)%n/n}var ci=class{m;c0;c1;u;constructor(e,t,i){let r=e.count(t);if(this.m=r,this.u=new Float64Array(r),i===st){this.c0=0,this.c1=r-1;for(let l=0;l<r;l++)this.u[l]=l/(r-1);return}let s=e.channel(i,"clock-channel-carried"),o=e.start(t);this.c0=s[o],this.c1=s[o+r-1];let a=Math.sign(s[o+1]-s[o]);for(let l=0;l<r;l++)(!Number.isFinite(s[o+l])||l>0&&!((s[o+l]-s[o+l-1])*a>0))&&T("monotone-clock-channel",`clock channel ${i} of trajectory set ${e.id} is not both finite and strictly monotone along trajectory ${t}`);Number.isFinite(this.c1-this.c0)||T("monotone-clock-channel",`clock channel ${i} of trajectory set ${e.id} has an infinite span along trajectory ${t}`);for(let l=0;l<r;l++)this.u[l]=(s[o+l]-this.c0)/(this.c1-this.c0)}at(e){return this.u[e]}reading(e,t){return e.mode==="fraction"?t:(wa(e,t)-this.c0)/(this.c1-this.c0)}locate(e){let t=0,i=this.m-2;for(;t<i;){let s=t+i+1>>1;this.u[s]<=e?t=s:i=s-1}let r=t;return{k:r,w:(e-this.u[r])/(this.u[r+1]-this.u[r])}}};function Pt(n){return n.revolutions===void 0?1:(n.mode==="epoch"&&T("revolutions","the clock is in epoch mode but has revolutions"),(!Number.isInteger(n.revolutions)||n.revolutions<1)&&T("revolutions",`the clock has revolutions ${String(n.revolutions)}, not an integer of at least one`),n.revolutions)}function on(n,e){let t=Math.min(Math.floor(n),e-1);return{revolution:t,u:n-t}}function qn(n,e="clamp",t="clamp"){return n<0?e==="hidden"?null:0:n>1?t==="hidden"?null:1:n}var Uf=new WeakMap;function io(n,e){let t=e!==null&&typeof e=="object"?Uf.get(e):void 0;if(t!==void 0&&t.frame_count===n.frame_count&&t.seconds===Ct(n))return t;(e===null||typeof e!="object"||typeof e.channel!="string")&&T("layer-clock",`a layer's clock is ${JSON.stringify(e)}, not {channel, range} or {channel, keyframes}`);let i=e.range!==void 0,r=e.keyframes!==void 0;i===r&&T("layer-clock",`the clock of a layer on channel ${e.channel} has ${i?"both a range and keyframes":"neither a range nor keyframes"}`),i&&!(Array.isArray(e.range)&&e.range.length===2&&e.range.every(o=>typeof o=="number"&&Number.isFinite(o)))&&T("layer-clock",`the clock of a layer on channel ${e.channel} has range ${JSON.stringify(e.range)}, not two finite numbers`),r&&li(e.keyframes,`the clock of a layer on channel ${e.channel}`);let s={mode:"epoch",channels:[e.channel],frame_count:n.frame_count,seconds:Ct(n)};return i?s.range=[e.range[0],e.range[1]]:s.keyframes=e.keyframes,Uf.set(e,s),s}function Vi(n,e){return typeof n=="number"?(Number.isFinite(n)||T("finite-number",`a scalar is ${n}, not finite`),n):((n===null||typeof n!="object")&&T("context-number",`${JSON.stringify(n)} is not a scalar`),"attr"in n?(n.factor??1)*e.set.attr(n.attr)+(n.offset??0):(n.channel===st&&T("context-number",`${st} is not allowed in a frame edge`),e.set.channelAt(n.channel,e.trajectory,e.sample,e.shifted,e.revolution??0)))}function Dh(n,e,t=!1){if((!Array.isArray(n)||n.length!==3)&&T("origin",`${e} is three scalars, not ${JSON.stringify(n)}`),!t)for(let i of n)i!==null&&typeof i=="object"&&"channel"in i&&T("origin",`${e} takes a number or an attribute, not a channel`);return n}function zf(n,e,t,i){let r=Math.cos(t),s=i?-Math.sin(t):Math.sin(t),[o,a,l]=n;return e==="z"?[r*o-s*a,s*o+r*a,l]:e==="x"?[o,r*a-s*l,s*a+r*l]:[r*o+s*l,a,-s*o+r*l]}var kh=class{frames;depth=new Map;paths=new Map;root;constructor(e){this.frames=e;let t=Object.keys(e),i=t.filter(s=>e[s].parent===void 0);i.length!==1&&T("frame",`the frames have ${i.length} roots, not one: ${JSON.stringify(i)}`),this.root=i[0];let r=e[this.root];(r.origin!==void 0||r.rotation!==void 0||r.scale!==void 0)&&T("frame",`the root frame ${this.root} has an origin, a rotation, or a scale`);for(let s of t){let o=e[s].scale;(o===0||o!==void 0&&typeof o=="object"&&"attr"in o&&(o.factor??1)===0&&(o.offset??0)===0)&&T("origin",`the scale of frame ${s} is zero`)}for(let s of t){let o=0;for(let a=s;a!==this.root;o++){let l=e[a].parent;(l===void 0||!Object.hasOwn(e,l))&&T("frame",`the parent ${l} of frame ${a} is not declared`),o>t.length&&T("frame",`the parents of frame ${s} form a cycle`),a=l}this.depth.set(s,o)}}has(e){return this.depth.has(e)}frame(e){return this.has(e)||T("frame",`frame ${JSON.stringify(e)} is not declared`),this.frames[e]}inSubtree(e,t){for(let i=e;i!==void 0;i=this.frames[i].parent)if(i===t)return!0;return!1}path(e,t){let i=this.paths.get(e),r=i?.get(t);if(r!==void 0)return r;this.frame(e),this.frame(t);let s=[],o=[],a=e,l=t;for(;this.depth.get(a)>this.depth.get(l);)s.push(a),a=this.frames[a].parent;for(;this.depth.get(l)>this.depth.get(a);)o.push(l),l=this.frames[l].parent;for(;a!==l;)s.push(a),o.push(l),a=this.frames[a].parent,l=this.frames[l].parent;let c={up:s,down:o.reverse()};return i===void 0&&this.paths.set(e,i=new Map),i.set(t,c),c}},Ta=(n,e)=>{n===void 0||typeof n=="number"||("attr"in n?e.attrs.add(n.attr):e.channels.add(n.channel))},Gi=class{tree;scene;active=new Set;edges=new Map;bodies=new Map;constructor(e){this.scene=e,this.tree=new kh(e.frames);for(let t of Object.keys(e.frames))this.requirements(t,this.tree.root)}body(e){let t=this.bodies.get(e);if(t!==void 0)return t;let i=this.scene.bodies??{};Object.hasOwn(i,e)||T("body",`body ${JSON.stringify(e)} is not declared`);let r=i[e];return Object.hasOwn(this.scene.frames,r.frame)||T("body",`body ${e} is in frame ${JSON.stringify(r.frame)}, which is not declared`),Dh(r.position,`the position of body ${e}`),this.bodies.set(e,r),r}edgeOf(e){let t=this.edges.get(e);if(t===void 0){let i=this.tree.frame(e),r=Array.isArray(i.origin)?Dh(i.origin,`the origin of frame ${e}`,!0):i.origin;t={parent:i.parent,origin:r,rotation:i.rotation,scale:i.scale},this.edges.set(e,t)}return t}transform(e,t,i,r){let{up:s,down:o}=this.tree.path(t,i),a=e;for(let l of s)a=this.edge(l,a,r,!0);for(let l of o)a=this.edge(l,a,r,!1);return a}bodyPosition(e,t,i){let r=this.body(e),s=r.position.map(o=>Vi(o,i));return this.transform(s,r.frame,t,i)}edge(e,t,i,r){let s=this.edgeOf(e),o=[0,0,0];if(Array.isArray(s.origin))o=[Vi(s.origin[0],i),Vi(s.origin[1],i),Vi(s.origin[2],i)];else if(s.origin!==void 0){this.active.has(e)&&T("body-origin-cycle",`the origin of frame ${e} depends on itself`),this.active.add(e);try{o=this.bodyPosition(s.origin.body,s.parent,i)}finally{this.active.delete(e)}}let a=s.scale===void 0?1:Vi(s.scale,i);a===0&&T("origin",`the scale of frame ${e} is zero`);let l=s.rotation,c=l===void 0?0:Vi(l.angle,i);if(!r){let u=[t[0]-o[0],t[1]-o[1],t[2]-o[2]];return l!==void 0&&(u=zf(u,l.axis,c,!1)),[a*u[0],a*u[1],a*u[2]]}let h=[t[0]/a,t[1]/a,t[2]/a];return l!==void 0&&(h=zf(h,l.axis,c,!0)),[o[0]+h[0],o[1]+h[1],o[2]+h[2]]}requirements(e,t,i={channels:new Set,attrs:new Set}){let{up:r,down:s}=this.tree.path(e,t);for(let o of[...r,...s]){this.active.has(o)&&T("body-origin-cycle",`the origin of frame ${o} depends on itself`),this.active.add(o);try{let a=this.tree.frame(o);Array.isArray(a.origin)?Dh(a.origin,`the origin of frame ${o}`,!0).forEach(l=>Ta(l,i)):a.origin!==void 0&&this.bodyRequirements(a.origin.body,a.parent,i),Ta(a.rotation?.angle,i),Ta(a.scale,i)}finally{this.active.delete(o)}}return i}bodyRequirements(e,t,i={channels:new Set,attrs:new Set}){let r=this.body(e);return r.position.forEach(s=>Ta(s,i)),this.requirements(r.frame,t,i)}};function ht(n,e){return n.inputs!==void 0&&Object.hasOwn(n.inputs,e)?n.inputs[e]:void 0}function Wi(n,e){let t=ht(n.scene,e);t===void 0&&T("input",`input ${JSON.stringify(e)} is not declared`);let i=t.scope==="per_panel"?n.panel.inputs:n.state.inputs,r=i!==void 0&&Object.hasOwn(i,e)?i[e]:void 0;return r===void 0?t.default:r}function Aa(n,e){return n.kind==="parameter"?typeof e=="number"&&Number.isFinite(e):n.kind==="toggle"?typeof e=="boolean":typeof e=="string"&&n.values.includes(e)}function Kr(n,e){n.clock.channels.includes(e.clock.channel)||T("clock",`the state's clock channel ${JSON.stringify(e.clock.channel)} is not one of the scene's clock channels`);let t=(s,o)=>{for(let[a,l]of Object.entries(s??{})){let c=ht(n,a);c!==void 0&&!Aa(c,l)&&T("input",`${o}: ${c.kind} ${a} cannot hold ${JSON.stringify(l)}`)}};t(e.inputs,"the state");let i=Object.keys(e.panels);i.length===0&&T("state","the state does not have a panel");for(let[s,o]of Object.entries(e.panels))Object.hasOwn(n.panels,o.panel)||T("state",`shown panel ${s} names ${JSON.stringify(o.panel)}, which is not a declared panel`),t(o.inputs,`panel ${s}`);let r=br(e.layout).sort();(r.length!==i.length||r.some((s,o)=>s!==i.slice().sort()[o]))&&T("state",`the layout shows the panels ${r.join(", ")}, while the state has the panels ${i.slice().sort().join(", ")}`)}function br(n,e=[]){return n.kind==="panel"?e.push(n.id):(br(n.a,e),br(n.b,e)),e}function m0(n,e){return typeof e=="string"?e:Wi(n,e.input)}function ro(n,e){if("set"in e)return Object.hasOwn(n.scene.trajectory_sets,e.set)||T("set-query",`the set query names ${JSON.stringify(e.set)}, which is not a trajectory set`),[e.set];(e.tags===null||typeof e.tags!="object")&&T("set-query",`a tags query has tags ${JSON.stringify(e.tags)}, not an object`);let t=Object.entries(e.tags).map(([i,r])=>[i,m0(n,r)]);return Object.entries(n.scene.trajectory_sets).filter(([,i])=>t.every(([r,s])=>Object.hasOwn(i.tags??{},r)&&i.tags[r]===s)).map(([i])=>i)}function Et(n,e){let t=ro(n,e);return t.length>1&&T("set-query",`the set query ${JSON.stringify(e)} matches the ${t.length} trajectory sets ${t.join(", ")}, where one is needed`),t[0]??null}function Ra(n,e,t){let i=ht(n.scene,e.input);(i===void 0||i.kind!=="parameter")&&T("members",`input ${e.input} is not of kind parameter`);let r=Wi(n,e.input);(typeof r!="number"||!Number.isFinite(r))&&T("input",`input ${e.input} holds ${JSON.stringify(r)}, not a finite number`);let s=t.parameter(i.parameter,"members"),o=0;for(let a=1;a<t.trajectories;a++)Math.abs(s[a]-r)<Math.abs(s[o]-r)&&(o=a);return o}function Hf(n,e){return(!Number.isInteger(n)||n<0)&&T("members",`member index ${JSON.stringify(n)} is not a trajectory index`),n>=e.trajectories&&T("members",`member index ${n} is not below the trajectory count ${e.trajectories} of trajectory set ${e.id}`),n}function g0(n,e){(!Number.isInteger(e)||e<1)&&T("members",`evenly_spaced ${JSON.stringify(e)} is not an integer of at least one`);let t=e>=n?1:Math.floor(n/e+.5),i=[];for(let r=0;r<n;r+=t)i.push(r);return i[i.length-1]!==n-1&&i.push(n-1),i}function Qr(n,e,t){return e==="all"?Array.from({length:t.trajectories},(i,r)=>r):((e===null||typeof e!="object")&&T("members",`a member reference is "all", {index}, {evenly_spaced}, or {input}, not ${JSON.stringify(e)}`),"index"in e?[Hf(e.index,t)]:"evenly_spaced"in e?g0(t.trajectories,e.evenly_spaced):[Ra(n,e,t)])}function es(n,e,t){return e==="all"&&T("members",'the member of the reference trajectory is "all", but a reference resolves to one trajectory'),(e===null||typeof e!="object")&&T("members",`the member of the reference trajectory is {index} or {input}, not ${JSON.stringify(e)}`),"evenly_spaced"in e&&T("members","the member of the reference trajectory is evenly_spaced, but a reference resolves to one trajectory"),"index"in e?Hf(e.index,t):Ra(n,e,t)}function Ca(n,e){let{scene:t,state:i}=n,r=br(i.layout).find(s=>i.panels[s]?.panel===e);return r===void 0?null:{shown:r,frame:xr({scene:t,state:i,panel:i.panels[r]},t.panels[e])}}function xr(n,e){let t=typeof e.frame=="string"?e.frame:Wi(n,e.frame.input);return(typeof t!="string"||!Object.hasOwn(n.scene.frames,t))&&T("panel",`the panel displays ${JSON.stringify(t)}, which is not a frame`),t}function ts(n,e){if(e.visible===void 0)return!0;let t=ht(n.scene,e.visible.input);(t===void 0||t.kind!=="toggle")&&T("visible",`a layer's visible names ${e.visible.input}, which is not a toggle`);let i=Wi(n,e.visible.input);return typeof i!="boolean"&&T("visible",`toggle ${e.visible.input} holds ${JSON.stringify(i)}, not a boolean`),i}function It(n,e,t,i=0){let{k:r,w:s}=n.locate(e);return{k:r,w:s,shifted:t,revolution:i}}function Pa(n,e,t,i=0){if(e===t)return[It(n,e,!1,i)];let r=[It(n,e,!1,i)];for(let s=0;s<n.m;s++){let o=n.at(s);e<o&&o<t&&r.push({sample:s,shifted:!1,revolution:i})}return r.push(It(n,t,!1,i)),r}function Ia(n,e,t,i){let r=on(e,i),s=on(t,i);if(r.revolution===s.revolution)return Pa(n,r.u,s.u,r.revolution);let o=Pa(n,r.u,1,r.revolution).slice(0,-1);for(let a=r.revolution+1;a<s.revolution;a++)o.push(...Pa(n,0,1,a).slice(0,-1));return o.push(...Pa(n,0,s.u,s.revolution)),o}function Oh(n,e,t){let i=t?e:1,r=[];for(let s=0;s<i;s++)for(let o=0;o<(s===i-1?n:n-1);o++)r.push({sample:o,shifted:!1,revolution:s});return r}function La(n,e,t,i,r){let s=e-t*i;return s<0&&!r&&(s=0),Ia(n,s,e,t)}function $i(n){return n.head===!0||typeof n.head=="object"&&n.head!==null}function vr(n,e,t,i){let r=n.revolution??0;if("sample"in n)return i({set:e,trajectory:t,sample:n.sample,shifted:n.shifted,revolution:r});let s=i({set:e,trajectory:t,sample:n.k,shifted:n.shifted,revolution:r}),o=i({set:e,trajectory:t,sample:n.k+1,shifted:n.shifted,revolution:r}),a=n.w;return[(1-a)*s[0]+a*o[0],(1-a)*s[1]+a*o[1],(1-a)*s[2]+a*o[2]]}function Mi(n,e){if(e.clock===void 0)return n;let t=n.base??n,i=io(t.clock,e.clock);return{...t,clock:i,channel:i.channels[0],base:t}}function _r(n,e,t){n=n.base??n,t??=new ci(e.set,e.trajectory,n.channel);let i=Pt(n.clock),r=i*qn(t.reading(n.clock,n.q)),s=on(r,i);return{tc:t,loopReading:r,at:It(t,s.u,!1,s.revolution)}}function ns(n,e){let t=e.revolution??0,{set:i,trajectory:r}=n;return{a:{set:i,trajectory:r,sample:e.k,shifted:!1,revolution:t},b:{set:i,trajectory:r,sample:e.k+1,shifted:!1,revolution:t},w:e.w}}function Vf(n,e,t,i=null){if(t===null)return{kind:"trajectories",set:null,members:[]};let r=e.reveal??"none";["none","grow","trail"].includes(r)||T("panel",`a trajectories layer's reveal is ${JSON.stringify(r)}, not none, grow, or trail`);for(let d of["before","after"])e[d]!==void 0&&e[d]!=="clamp"&&e[d]!=="hidden"&&T("before-after",`a trajectories layer's ${d} is ${JSON.stringify(e[d])}, not clamp or hidden`);r==="trail"&&Nh(e);let s=e.read_from??"own";s!=="own"&&s!=="reference"&&T("read-from",`a trajectories layer's read_from is ${JSON.stringify(s)}, not own or reference`);let o=Pt(n.clock),a=t.def.frame,l=d=>n.frames.transform(t.position(d.trajectory,d.sample),a,n.display,d),c=s==="reference"&&i!==null?ns(i,_r(n,i).at):null;if(c!==null){let{a:d,b:p,w:y}=c;l=m=>{let g=t.position(m.trajectory,m.sample),b=n.frames.transform(g,a,n.display,d),_=n.frames.transform(g,a,n.display,p);return[(1-y)*b[0]+y*_[0],(1-y)*b[1]+y*_[1],(1-y)*b[2]+y*_[2]]}}let h=$i(e),u=r!=="none"||h||n.clock.mode==="epoch"&&(e.before==="hidden"||e.after==="hidden");u&&o>1&&!t.periodic&&T("revolutions",`a reading is taken on trajectory set ${t.id}, which is not periodic, and the clock has ${o} revolutions`);let f=[];for(let d of Qr(n.scope,e.members,t)){let p=[],y=null,m=null;u&&(m=new ci(t,d,n.channel),y=qn(m.reading(n.clock,n.q),e.before,e.after));let g=u&&y===null||s==="reference"&&c===null,b=o*(y??0);g||(r==="none"?p.push(...Oh(t.count(d),o,t.periodic)):r==="grow"?p.push(...Ia(m,0,b,o)):p.push(...La(m,b,o,Nh(e),t.periodic)));let _={index:d,line:p.map(x=>vr(x,t,d,l))};if(h){let x=on(b,o);_.head=g?null:vr(It(m,x.u,!1,x.revolution),t,d,l)}f.push(_)}return{kind:"trajectories",set:t.id,members:f}}function Fh(n){let e=n.vector;(!Array.isArray(e)||e.length<2||e.length>3||!e.every(i=>typeof i=="string"))&&T("arrow",`an arrow layer's vector is ${JSON.stringify(e)}, not two or three channel names`),e.includes(st)&&T("arrow",`${st} is not allowed in the vector of an arrow layer`);let t=n.scale??1;return typeof t=="object"&&t!==null&&"channel"in t&&T("arrow","the scale of an arrow layer takes a number or an attribute, not a channel"),{vector:e,scale:t}}function Da(n,e,t,i){let{vector:r,scale:s}=Fh(e);for(let h of["before","after"])e[h]!==void 0&&e[h]!=="clamp"&&e[h]!=="hidden"&&T("before-after",`an arrow layer's ${h} is ${JSON.stringify(e[h])}, not clamp or hidden`);if(t===null)return{kind:"arrow",set:null,members:[]};for(let h of r)t.hasChannel(h)||T("arrow",`trajectory set ${t.id} lacks channel ${JSON.stringify(h)} of an arrow layer's vector`);let o=Pt(n.clock);o>1&&!t.periodic&&T("revolutions",`a reading is taken on trajectory set ${t.id}, which is not periodic, and the clock has ${o} revolutions`);let a=t.def.frame,l=r.map(h=>t.channel(h)),c=[];for(let h of Qr(n.scope,e.members,t)){let u=i?i(h):new ci(t,h,n.channel),f=qn(u.reading(n.clock,n.q),e.before,e.after);if(f===null){c.push({index:h,base:null,tip:null});continue}let d=Vi(s,{set:t,trajectory:h,sample:0,shifted:!1,revolution:0}),p=t.start(h),y=_=>n.frames.transform(t.position(_.trajectory,_.sample),a,n.display,_),m=_=>{let x=t.position(_.trajectory,_.sample);for(let M=0;M<l.length;M++)x[M]+=d*l[M][p+_.sample];return n.frames.transform(x,a,n.display,_)},g=on(o*f,o),b=It(u,g.u,!1,g.revolution);c.push({index:h,base:vr(b,t,h,y),tip:vr(b,t,h,m)})}return{kind:"arrow",set:t.id,members:c}}function Uh(n,e,t){let i=t.panel;(typeof i!="string"||!Object.hasOwn(n.panels,i))&&T("inset-box",`an inset_box layer names ${JSON.stringify(i)}, which is not a declared panel`),i===e&&T("inset-box",`an inset_box layer of panel ${e} names its own panel`),(n.panels[i].camera?.kind??"2d")!=="2d"&&T("inset-box",`an inset_box layer names panel ${i}, whose camera is not a 2d camera`)}function ka(n,e,t){Uh(n.scope.scene,n.scope.panel.panel,e);let i={kind:"inset_box",panel:e.panel,shown_panel:null,frame:null,origin:null,axes:null},r=Ca(n.scope,e.panel);if(r===null||(i.shown_panel=r.shown,i.frame=r.frame,t===null))return i;let{a:s,b:o,w:a}=ns(t,_r(n,t).at),l=u=>{let f=n.frames.transform(u,r.frame,n.display,s),d=n.frames.transform(u,r.frame,n.display,o);return[(1-a)*f[0]+a*d[0],(1-a)*f[1]+a*d[1],(1-a)*f[2]+a*d[2]]},c=l([0,0,0]),h=u=>{let f=l(u);return[f[0]-c[0],f[1]-c[1],f[2]-c[2]]};return i.origin=c,i.axes=[h([1,0,0]),h([0,1,0]),h([0,0,1])],i}function Nh(n){n.trail===void 0&&T("panel","a layer draws a trail but lacks a trail fraction");let e=n.trail.fraction;return(typeof e!="number"||!(e>0&&e<=1))&&T("panel",`the trail fraction ${String(e)} is not in (0, 1]`),e}function Gf(n,e,t){let i={kind:"body",body:e.body,position:null};if(t===null)return e.trail!==void 0&&(i.trail=[]),i;let{set:r,trajectory:s}=t,o=Pt(n.clock),{tc:a,loopReading:l,at:c}=_r(n,t),h=u=>n.frames.bodyPosition(e.body,n.display,u);return i.position=vr(c,r,s,h),e.trail!==void 0&&(i.trail=La(a,l,o,Nh(e),r.periodic).map(u=>vr(u,r,s,h))),i}function y0(n,e,t,i){let r=t.def.frame,s=c=>n.frames.transform(t.position(c.trajectory,c.sample),r,n.display,c);if((e.read_from??"own")!=="reference")return{f:s,hidden:!1};if(i===null)return{f:s,hidden:!0};let{a:o,b:a,w:l}=ns(i,_r(n,i).at);return{hidden:!1,f:c=>{let h=t.position(c.trajectory,c.sample),u=n.frames.transform(h,r,n.display,o),f=n.frames.transform(h,r,n.display,a);return[(1-l)*u[0]+l*f[0],(1-l)*u[1]+l*f[1],(1-l)*u[2]+l*f[2]]}}}function Wf(n,e,t,i){(!Number.isInteger(e)||e<0||e>=n.trajectories)&&T(t,`${i} names member ${String(e)}, which is not a trajectory of trajectory set ${n.id} of ${n.trajectories}`)}function $f(n,e,t,i){let r=Pt(n.clock);r>1&&!e.periodic&&T("revolutions",`a reading is taken on trajectory set ${e.id}, which is not periodic, and the clock has ${r} revolutions`);let s=new ci(e,t,n.channel),o=on(r*qn(s.reading(n.clock,n.q)),r);return vr(It(s,o.u,!1,o.revolution),e,t,i)}function jf(n,e,t,i,r){if(t===null)return null;Wf(t,i,"camera-keyframes","a camera keyframe");let s=Mi(n,e),{f:o,hidden:a}=y0(s,e,t,r);return a?null:$f(s,t,i,o)}function Na(n,e,t,i){let r=e.at;if((r===null||typeof r!="object")&&T("label",`a label's anchor is ${JSON.stringify(r)}, not an object`),"screen"in r)return{kind:"label",position:null};if("point"in r){let c=r.point;(!Array.isArray(c)||c.length!==3||!c.every(m=>typeof m=="number"&&Number.isFinite(m)))&&T("label",`a label's point is ${JSON.stringify(c)}, not three finite numbers`);let h=[c[0],c[1],c[2]];if(r.frame===void 0)return{kind:"label",position:h};if(i===null)return{kind:"label",position:null};let{a:u,b:f,w:d}=ns(i,_r(n,i).at),p=n.frames.transform(h,r.frame,n.display,u),y=n.frames.transform(h,r.frame,n.display,f);return{kind:"label",position:[(1-d)*p[0]+d*y[0],(1-d)*p[1]+d*y[1],(1-d)*p[2]+d*y[2]]}}if((!("sets"in r)||!("member"in r))&&T("label",`a label's anchor is ${JSON.stringify(r)}, not a point, a member, or a place on the screen`),t===null)return{kind:"label",position:null};let s=r.member;Wf(t,s,"label","a label");let o=Mi(n,e),a=t.def.frame;return{kind:"label",position:$f(o,t,s,c=>o.frames.transform(t.position(c.trajectory,c.sample),a,o.display,c))}}function Oa(n,e,t){let i=e.reveal??"none";i!=="none"&&i!=="grow"&&T("points",`a points layer's reveal is ${JSON.stringify(i)}, not none or grow`);for(let h of["before","after"])e[h]!==void 0&&e[h]!=="clamp"&&e[h]!=="hidden"&&T("before-after",`a points layer's ${h} is ${JSON.stringify(e[h])}, not clamp or hidden`);if(t===null)return{kind:"points",set:null,members:[]};let r=Mi(n,e),s=r.clock.mode==="epoch"&&(e.before==="hidden"||e.after==="hidden"),o=i==="grow"||s,a=Pt(r.clock);o&&a>1&&!t.periodic&&T("revolutions",`a reading is taken on trajectory set ${t.id}, which is not periodic, and the clock has ${a} revolutions`);let l=t.def.frame,c=[];for(let h of Qr(n.scope,e.members,t)){let u=t.count(h),f=u-1;if(o){let p=new ci(t,h,r.channel),y=p.reading(r.clock,r.q);if(qn(y,e.before,e.after)===null)f=-1;else if(i==="grow")for(f=-1;f+1<u&&p.at(f+1)<=y;)f++}let d=[];for(let p=0;p<=f;p++)d.push(r.frames.transform(t.position(h,p),l,r.display,{set:t,trajectory:h,sample:p,shifted:!1,revolution:0}));c.push({index:h,points:d})}return{kind:"points",set:t.id,members:c}}var Bh=class{id;def;trajectories;samples;dim;data;offsets;positions;channels=new Map;parameters=new Map;constructor(e,t,i){this.id=e,this.def=t,this.data=i,this.trajectories=t.trajectories;let r=i.array(t.offsets);(r.dtype!=="uint32"||r.shape.length!==1||r.shape[0]!==t.trajectories+1)&&T("trajectory-set",`trajectory set ${e}: offsets array ${t.offsets} is ${r.dtype} of shape (${r.shape.join(", ")}), not uint32 of shape (${t.trajectories+1},)`),this.offsets=r.data,this.offsets[0]!==0&&T("trajectory-set",`trajectory set ${e}: offsets[0] is ${this.offsets[0]}, not 0`);for(let l=0;l<t.trajectories;l++){let c=this.offsets[l+1]-this.offsets[l];c<2&&T("two-samples",`trajectory set ${e}: the sample count of trajectory ${l} is ${c}, fewer than two`)}this.samples=this.offsets[t.trajectories];let s=i.array(t.positions),[o,a]=s.shape;(s.shape.length!==2||o!==this.samples||a!==2&&a!==3)&&T("trajectory-set",`trajectory set ${e}: positions array ${t.positions} has shape (${s.shape.join(", ")}), not (${this.samples}, 2) or (${this.samples}, 3)`),this.positions=s.data,this.dim=a}get periodic(){return this.def.periodic===!0}start(e){return this.offsets[e]}count(e){return this.offsets[e+1]-this.offsets[e]}position(e,t){let i=(this.offsets[e]+t)*this.dim,r=this.positions;return[r[i],r[i+1],this.dim===3?r[i+2]:0]}hasChannel(e){return e===st||Object.hasOwn(this.def.channels??{},e)}channel(e,t="transform-channels"){let i=this.channels.get(e);if(i)return i;let r=this.def.channels?.[e];(r===void 0||!Object.hasOwn(this.def.channels??{},e))&&T(t,`trajectory set ${this.id} lacks channel ${JSON.stringify(e)}`);let s=this.data.array(r.array);return(s.shape.length!==1||s.shape[0]!==this.samples)&&T("trajectory-set",`trajectory set ${this.id}: channel ${e} has shape (${s.shape.join(", ")}), not (${this.samples},)`),this.channels.set(e,s.data),s.data}channelAt(e,t,i,r,s=0){let o=this.count(t),a=s-(r?1:0);if(e===st)return a===0?i:i+a*(o-1);let l=this.channel(e),c=this.offsets[t],h=l[c+i];return a===0?h:h+a*(l[c+o-1]-l[c])}hasParameter(e){return e===Si||Object.hasOwn(this.def.parameters??{},e)}parameter(e,t="input"){let i=this.parameters.get(e);if(i)return i;if(e===Si){let o=Float64Array.from({length:this.trajectories},(a,l)=>l);return this.parameters.set(e,o),o}let r=this.def.parameters?.[e];(r===void 0||!Object.hasOwn(this.def.parameters??{},e))&&T(t,`trajectory set ${this.id} lacks parameter ${JSON.stringify(e)}`);let s=this.data.array(r.array);return(s.shape.length!==1||s.shape[0]!==this.trajectories)&&T("trajectory-set",`trajectory set ${this.id}: parameter ${e} has shape (${s.shape.join(", ")}), not (${this.trajectories},)`),this.parameters.set(e,s.data),s.data}hasAttr(e){return Object.hasOwn(this.def.attrs??{},e)}attr(e){let t=this.def.attrs?.[e];return(t===void 0||!this.hasAttr(e))&&T("transform-channels",`trajectory set ${this.id} lacks attribute ${JSON.stringify(e)}`),t}},ji=class{scene;data;sets=new Map;constructor(e,t){this.scene=e,this.data=t}get(e){let t=this.sets.get(e);if(!t){let i=this.scene.trajectory_sets[e];(i===void 0||!Object.hasOwn(this.scene.trajectory_sets,e))&&T("trajectory-set",`trajectory set ${JSON.stringify(e)} is not declared`),t=new Bh(e,i,this.data),this.sets.set(e,t)}return t}};var b0=["trajectories","arrow","inset_box","body","axes","grid","label","points"],Xf=["disc","ring","square","diamond","triangle","star","cross","plus"],x0=["slider","tabs","toggle","playback"],Fa=["viridis","plasma","cividis","blues","reds"],zh=(n,e)=>{Sa.test(n)||T("identifier",`${e} ${JSON.stringify(n)} does not match [A-Za-z0-9_.-]+`)},Mt=n=>typeof n=="number"&&Number.isFinite(n),xn=/^#[0-9a-fA-F]{6}$/;function Xi(n,e,t,i){if(!(n===null||typeof n!="object"||Array.isArray(n)))for(let r of Object.keys(n))e.includes(r)||i.push(`${t} has a key ${JSON.stringify(r)} that this reader does not know`)}var v0=["label","axes","unit","parent","origin","rotation","scale"],_0=["label","frame","position","color","image"],S0=["label","frame","tags","attrs","trajectories","offsets","positions","channels","parameters","periodic"],M0=["label","frame","camera","reference","layers","opacity","margin"],w0=["kind","plane","aspect","keyframes"],E0=["kind","projection","up","stretch","auto_rotate"],T0=["align","baseline","size","color","weight","linespacing","box","opacity"],qf={trajectories:["kind","sets","members","reveal","trail","head","before","after","read_from","fit","color","opacity","width","highlight","visible","clock","line","group_opacity","dash","fill"],arrow:["kind","sets","members","vector","scale","before","after","color","opacity","width","head","visible","clock"],inset_box:["kind","panel","color","opacity","width","dash","min_size","visible"],body:["kind","body","trail","size","visible","opacity"],axes:["kind","span","visible","ticks","size","opacity","titles"],grid:["kind","labels","visible","opacity"],label:["kind","text","at","offset","leader","clock","visible",...T0],points:["kind","sets","members","marker","reveal","before","after","clock","fit","opacity","visible"]},A0=["mode","channels","labels","frame_count","range","revolutions","seconds","keyframes","end"],R0=["background","foreground","grid","font","gutter"];function C0(n){n.format!=="tycho-scene"&&T("scene",`the format is ${JSON.stringify(n.format)}, not "tycho-scene"`);let e=[],t=/^([0-9]+)\.([0-9]+)$/.exec(String(n.version));t===null?e.push(`version ${JSON.stringify(n.version)} is not "major.minor"`):Number(t[1])!==0?e.push(`major version ${t[1]} is unknown to this reader, which reads ${0}.x`):Number(t[2])>5&&e.push(`version ${t[1]}.${t[2]} is newer than this reader's ${0}.${5}, and the format is unstable until 1.0`);let i=(n.requires??[]).filter(r=>!Df.has(r));i.length>0&&e.push(`the required features ${i.join(", ")} are not implemented`),e.length>0&&T("version",e.join(", and "))}function Yn(n,e,t,i){let r=ht(n,e);r===void 0&&T(i,`input ${JSON.stringify(e)} is not declared`),t!==null&&r.kind!==t&&T(i,`input ${e} is a ${r.kind}, not a ${t}`)}function Ua(n,e,t){if(n!==void 0){if(typeof n=="number"){Number.isFinite(n)||T("finite-number",`${e} is ${String(n)}, not finite`);return}if("attr"in n){(!Mt(n.factor??1)||!Mt(n.offset??0))&&T("finite-number",`${e} has a factor or offset that is not finite`);return}t&&T("origin",`${e} takes a number or an attribute, not a channel`),n.channel===st&&T("context-number",`${e} reads channel ${st}, which is not allowed in a frame edge`)}}function za(n,e){if("set"in e)Object.hasOwn(n.trajectory_sets,e.set)||T("set-query",`the set query names ${JSON.stringify(e.set)}, which is not a trajectory set`);else for(let t of Object.values(e.tags))typeof t=="object"&&t!==null&&Yn(n,t.input,"choice","set-query")}var Sr=n=>typeof n=="number"&&n>=0&&n<=1;function Yf(n,e){e.fraction>0&&e.fraction<=1||T("panel",`panel ${n}: a trail fraction is ${e.fraction}, not in (0, 1]`),e.taper!==void 0&&!(Sr(e.taper.width??0)&&Sr(e.taper.opacity??0))&&T("panel",`panel ${n}: a trail taper is not in [0, 1]`)}function Hh(n,e,t){e.shape!==void 0&&!Xf.includes(e.shape)&&T(t,`panel ${n}: a marker's shape is ${JSON.stringify(e.shape)}, not one of ${Xf.join(", ")}`);for(let i of["color","edge"])e[i]!==void 0&&!xn.test(e[i])&&T(t,`panel ${n}: a marker's ${i} is ${JSON.stringify(e[i])}, not a #rrggbb color`);bn(e.size,`panel ${n}: a marker's size`,Hi,t),bn(e.opacity,`panel ${n}: a marker's opacity`,Vn,t),bn(e.edge_width,`panel ${n}: a marker's edge_width`,i=>typeof i=="number"&&Number.isFinite(i)&&i>=0,t)}function Ha(n,e){e!==void 0&&((e===null||typeof e!="object"||typeof e.channel!="string")&&T("layer-clock",`panel ${n}: a layer's clock is ${JSON.stringify(e)}, not {channel, range} or {channel, keyframes}`),e.range===void 0==(e.keyframes===void 0)&&T("layer-clock",`panel ${n}: a layer's clock on ${e.channel} has ${e.range===void 0?"neither a range nor keyframes":"both a range and keyframes"}`),e.range!==void 0&&!(Array.isArray(e.range)&&e.range.length===2&&e.range.every(Mt))&&T("layer-clock",`panel ${n}: a layer's clock on ${e.channel} has range ${JSON.stringify(e.range)}, not two finite numbers`),e.keyframes!==void 0&&li(e.keyframes,`panel ${n}: the clock of a layer on ${e.channel}`))}function Ba(n,e,t){if(typeof e!="string"){Array.isArray(e)||T("control",`${t} has text ${JSON.stringify(e)}, not a string or a list of parts`);for(let i of e){if(typeof i=="string")continue;if((i===null||typeof i!="object")&&T("control",`${t} has a part ${JSON.stringify(i)}`),"input"in i&&Yn(n,i.input,null,"control"),"channel"in i&&i.channel===st&&T("control",`${t} has a channel part naming ${st}, which is not allowed in a readout`),"timed_text"in i){Array.isArray(i.timed_text)||T("timeline-parts",`${t} has timed_text ${JSON.stringify(i.timed_text)}, not a list of [t, text] pairs`);let o=-1/0;for(let a of i.timed_text)(!Array.isArray(a)||a.length!==2||!Mt(a[0])||typeof a[1]!="string")&&T("timeline-parts",`${t} has a timed text ${JSON.stringify(a)}, not [t, text]`),a[0]<o&&T("timeline-parts",`${t} has timed text whose times decrease`),o=a[0];continue}"keyframes"in i&&li(i.keyframes,t),"clock"in i&&!["frame_index","frame_count","value","time"].includes(i.clock)&&T("control",`${t} has a clock part ${JSON.stringify(i.clock)}`);let r=i;(!Mt(r.factor??1)||!Mt(r.offset??0))&&T("finite-number",`${t} has a part whose factor or offset is not finite`),r.digits!==void 0&&!(Number.isInteger(r.digits)&&r.digits>=1&&r.digits<=17)&&T("control",`${t} has digits ${String(r.digits)}, not in 1 to 17`),r.decimals!==void 0&&!(Number.isInteger(r.decimals)&&r.decimals>=0&&r.decimals<=17)&&T("timeline-parts",`${t} has decimals ${String(r.decimals)}, not in 0 to 17`),r.digits!==void 0&&r.decimals!==void 0&&T("timeline-parts",`${t} has a part with both digits and decimals`);let s=i.width;s!==void 0&&!(Number.isInteger(s)&&s>=0&&s<=40)&&T("timeline-parts",`${t} has width ${String(s)}, not in 0 to 40`)}}}function Jf(n,e){e.align!==void 0&&!["start","center","end"].includes(e.align)&&T("label",`${n}: an align is ${JSON.stringify(e.align)}`),e.baseline!==void 0&&!["top","middle","bottom","alphabetic"].includes(e.baseline)&&T("label",`${n}: a baseline is ${JSON.stringify(e.baseline)}`),e.size!==void 0&&!Hi(e.size)&&T("label",`${n}: a text size is ${JSON.stringify(e.size)}, not positive`),e.color!==void 0&&!xn.test(e.color)&&T("label",`${n}: a text color is ${JSON.stringify(e.color)}, not #rrggbb`),e.weight!==void 0&&e.weight!=="normal"&&e.weight!=="bold"&&T("label",`${n}: a weight is ${JSON.stringify(e.weight)}, not normal or bold`),e.linespacing!==void 0&&!Hi(e.linespacing)&&T("label",`${n}: a linespacing is ${JSON.stringify(e.linespacing)}, not positive`),bn(e.opacity,`${n}: an opacity`,Vn,"label");let t=e.box;if(t!==void 0){for(let i of["fill","edge"])t[i]!==void 0&&!xn.test(t[i])&&T("label",`${n}: a box ${i} is not #rrggbb`);t.opacity!==void 0&&!Sr(t.opacity)&&T("label",`${n}: a box opacity is not in [0, 1]`)}}function P0(n,e,t){Ba(n,t.text,`panel ${e}: a label`),Jf(`panel ${e}`,t),Ha(e,t.clock);let i=t.at;if((i===null||typeof i!="object")&&T("label",`panel ${e}: a label's anchor is ${JSON.stringify(i)}`),"point"in i){let o=i.point;(!Array.isArray(o)||o.length!==3||!o.every(Mt))&&T("label",`panel ${e}: a label's point is ${JSON.stringify(o)}, not three finite numbers`),i.frame!==void 0&&!Object.hasOwn(n.frames,i.frame)&&T("label",`panel ${e}: a label's point is in frame ${JSON.stringify(i.frame)}, which is not declared`)}else if("sets"in i)za(n,i.sets),(!Number.isInteger(i.member)||i.member<0)&&T("label",`panel ${e}: a label's member is ${JSON.stringify(i.member)}, not a trajectory index`);else if("screen"in i){let o=i.screen;(!Array.isArray(o)||o.length!==2||!o.every(Mt))&&T("label",`panel ${e}: a label's screen place is ${JSON.stringify(o)}, not two fractions`)}else T("label",`panel ${e}: a label's anchor is ${JSON.stringify(i)}, not a point, a member, or a place on the screen`);let r=t.offset;r!==void 0&&!(Array.isArray(r)&&r.length===2&&r.every(Mt))&&T("label",`panel ${e}: a label's offset is ${JSON.stringify(r)}, not two lengths`);let s=t.leader;s!==void 0&&typeof s=="object"&&s.color!==void 0&&!xn.test(s.color)&&T("label",`panel ${e}: a leader's color is not #rrggbb`)}function I0(n,e,t){Vh(n,e,t);let i=t.reveal??"none";i!=="none"&&i!=="grow"&&T("points",`panel ${e}: a points layer's reveal is ${JSON.stringify(i)}, not none or grow`);for(let r of["before","after"])t[r]!==void 0&&t[r]!=="clamp"&&t[r]!=="hidden"&&T("before-after",`panel ${e}: a points layer's ${r} is ${JSON.stringify(t[r])}, not clamp or hidden`);t.marker!==void 0&&Hh(e,t.marker,"points"),bn(t.opacity,`panel ${e}: a points layer's opacity`,Vn),Ha(e,t.clock)}function Vh(n,e,t){za(n,t.sets),typeof t.members=="object"&&"input"in t.members&&Yn(n,t.members.input,"parameter","members");let i=t.members;typeof i=="object"&&"evenly_spaced"in i&&!(Number.isInteger(i.evenly_spaced)&&i.evenly_spaced>=1)&&T("members",`panel ${e}: evenly_spaced ${JSON.stringify(i.evenly_spaced)} is not an integer of at least one`)}function L0(n,e,t){Vh(n,e,t),Fh(t);for(let i of["before","after"])t[i]!==void 0&&t[i]!=="clamp"&&t[i]!=="hidden"&&T("before-after",`panel ${e}: an arrow layer's ${i} is ${JSON.stringify(t[i])}, not clamp or hidden`);t.color!==void 0&&!xn.test(t.color)&&T("arrow",`panel ${e}: an arrow layer's color is ${JSON.stringify(t.color)}, not a #rrggbb color`),t.head?.size!==void 0&&!(t.head.size>0)&&T("arrow",`panel ${e}: an arrowhead size is ${t.head.size}, not positive`),bn(t.opacity,`panel ${e}: an arrow layer's opacity`,Vn),t.width!==void 0&&!(t.width>0)&&T("panel",`panel ${e}: an arrow layer's width is ${t.width}, not positive`),Ha(e,t.clock)}function D0(n,e,t){Uh(n,e,t),t.color!==void 0&&!xn.test(t.color)&&T("inset-box",`panel ${e}: an inset_box layer's color is ${JSON.stringify(t.color)}, not a #rrggbb color`),bn(t.opacity,`panel ${e}: an inset_box layer's opacity`,Vn),t.width!==void 0&&!(t.width>0)&&T("panel",`panel ${e}: an inset_box layer's width is ${t.width}, not positive`);let i=t.dash;i!==void 0&&!(Array.isArray(i)&&i.length===2&&i.every(r=>Mt(r)&&r>0))&&T("inset-box",`panel ${e}: an inset_box layer's dash is ${JSON.stringify(i)}, not two positive lengths`),t.min_size!==void 0&&!(Mt(t.min_size)&&t.min_size>=0)&&T("inset-box",`panel ${e}: an inset_box layer's min_size is ${t.min_size}, not a nonnegative length`)}function k0(n,e,t){Vh(n,e,t),t.fit!==void 0&&typeof t.fit!="boolean"&&T("panel",`panel ${e}: a trajectories layer's fit is ${JSON.stringify(t.fit)}, not a boolean`);let i=t.highlight;i!==void 0&&(Yn(n,i.input,"parameter","panel"),i.width!==void 0&&!(i.width>0)&&T("panel",`panel ${e}: a highlight width is ${i.width}, not positive`),i.opacity!==void 0&&!Sr(i.opacity)&&T("panel",`panel ${e}: a highlight opacity is ${i.opacity}, not in [0, 1]`),i.kernel!==void 0&&(i.kernel.width>0&&i.kernel.width<=1||T("panel",`panel ${e}: a highlight kernel's width is ${i.kernel.width}, not in (0, 1]`),Sr(i.kernel.opacity)||T("panel",`panel ${e}: a highlight kernel's opacity is ${i.kernel.opacity}, not in [0, 1]`)));let r=t.reveal??"none";if(["none","grow","trail"].includes(r)||T("panel",`panel ${e}: a trajectories layer's reveal is ${JSON.stringify(r)}, not none, grow, or trail`),r==="trail"&&t.trail===void 0&&T("panel",`panel ${e}: a trajectories layer has reveal "trail" but lacks a trail`),t.trail!==void 0&&Yf(e,t.trail),t.head!==void 0&&typeof t.head!="boolean"){(typeof t.head!="object"||t.head===null)&&T("head",`panel ${e}: a trajectories layer's head is ${JSON.stringify(t.head)}, not a boolean or an object`),t.head.color!==void 0&&!xn.test(t.head.color)&&T("head",`panel ${e}: a head color is ${JSON.stringify(t.head.color)}, not a #rrggbb color`),Hh(e,t.head,"head");let o=t.head.glow;o!==void 0&&((typeof o.channel!="string"||o.channel===st)&&T("timeline",`panel ${e}: a glow names channel ${JSON.stringify(o.channel)}`),o.color!==void 0&&!xn.test(o.color)&&T("timeline",`panel ${e}: a glow's color is not #rrggbb`),o.size!==void 0&&!Hi(o.size)&&T("timeline",`panel ${e}: a glow's size is not positive`),o.opacity!==void 0&&!Sr(o.opacity)&&T("timeline",`panel ${e}: a glow's opacity is not in [0, 1]`))}t.line!==void 0&&typeof t.line!="boolean"&&T("panel",`panel ${e}: a trajectories layer's line is ${JSON.stringify(t.line)}, not a boolean`),t.group_opacity!==void 0&&typeof t.group_opacity!="boolean"&&T("panel",`panel ${e}: a trajectories layer's group_opacity is ${JSON.stringify(t.group_opacity)}, not a boolean`);let s=t.dash;s!==void 0&&!(Array.isArray(s)&&s.length===2&&s.every(o=>Mt(o)&&o>0))&&T("timeline",`panel ${e}: a trajectories layer's dash is ${JSON.stringify(s)}, not two positive lengths`),t.fill!==void 0&&(t.fill.base!==void 0&&!Mt(t.fill.base)&&T("finite-number",`panel ${e}: a fill's base is not finite`),t.fill.color!==void 0&&!xn.test(t.fill.color)&&T("panel",`panel ${e}: a fill's color is not #rrggbb`),t.fill.opacity!==void 0&&!Sr(t.fill.opacity)&&T("panel",`panel ${e}: a fill's opacity is not in [0, 1]`)),Ha(e,t.clock);for(let o of["before","after"])t[o]!==void 0&&t[o]!=="clamp"&&t[o]!=="hidden"&&T("before-after",`panel ${e}: a trajectories layer's ${o} is ${JSON.stringify(t[o])}, not clamp or hidden`);if(t.read_from!==void 0&&t.read_from!=="own"&&t.read_from!=="reference"&&T("read-from",`panel ${e}: a trajectories layer's read_from is ${JSON.stringify(t.read_from)}, not own or reference`),bn(t.opacity,`panel ${e}: a trajectories layer's opacity`,Vn),t.width!==void 0&&!(t.width>0)&&T("panel",`panel ${e}: a trajectories layer's width is ${t.width}, not positive`),t.color!==void 0&&typeof t.color=="object"&&"thresholds"in t.color){let o=t.color,a=o.thresholds;(!Array.isArray(a)||a.length===0||!a.every(Mt)||a.some((l,c)=>c>0&&!(l>a[c-1])))&&T("timeline",`panel ${e}: a threshold color's thresholds are ${JSON.stringify(a)}, not increasing finite numbers`),(!Array.isArray(o.colors)||o.colors.length!==a.length+1||!o.colors.every(l=>xn.test(l)))&&T("timeline",`panel ${e}: a threshold color has ${JSON.stringify(o.colors)} for ${a.length} thresholds, not one #rrggbb color more than thresholds`)}else if(t.color!==void 0&&typeof t.color=="object"){let o=t.color.colormap;if(typeof o=="object"&&o!==null){Yn(n,o.input,"choice","panel");let a=ht(n,o.input).values,l=Object.keys(o.map??{}),c=a.filter(u=>!Object.hasOwn(o.map,u)),h=l.filter(u=>!a.includes(u));c.length>0&&T("panel",`panel ${e}: a colormap keyed on ${o.input} does not name a colormap for ${JSON.stringify(c)}`),h.length>0&&T("panel",`panel ${e}: a colormap keyed on ${o.input} maps ${JSON.stringify(h)}, which are not its values`);for(let u of l)Fa.includes(o.map[u])||T("panel",`panel ${e}: the colormap ${JSON.stringify(o.map[u])} is not one of ${Fa.join(", ")}`)}else Fa.includes(o)||T("panel",`panel ${e}: the colormap ${JSON.stringify(o)} is not one of ${Fa.join(", ")}`);"parameter"in t.color=="channel"in t.color&&T("panel",`panel ${e}: a colormap color names both or neither of parameter and channel`)}}function Va(n,e,t){let i=[];C0(n);for(let h of Object.keys(n))kf.has(h)||i.push(`the scene has a top-level key ${JSON.stringify(h)} that this reader does not know`);Xi(n.theme,R0,"the theme",i);for(let[h,u]of Object.entries(n.theme??{}))h==="font"?typeof u!="string"&&T("scene",`theme font is ${JSON.stringify(u)}, not a CSS font family`):(typeof u!="string"||!xn.test(u))&&T("scene",`theme ${h} is ${JSON.stringify(u)}, not a #rrggbb color`);Xi(n.clock,A0,"the clock",i);for(let[h,u]of Object.entries(n.frames))Xi(u,v0,`frame ${h}`,i);for(let[h,u]of Object.entries(n.bodies??{}))Xi(u,_0,`body ${h}`,i),u.color!==void 0&&!xn.test(u.color)&&T("body",`body ${h} has color ${JSON.stringify(u.color)}, not #rrggbb`);for(let[h,u]of Object.entries(n.trajectory_sets))Xi(u,S0,`trajectory set ${h}`,i);for(let[h,u]of Object.entries(n.panels)){Xi(u,M0,`panel ${h}`,i),u.camera!==void 0&&Xi(u.camera,u.camera.kind==="3d"?E0:w0,`the camera of panel ${h}`,i);for(let f of u.layers)Object.hasOwn(qf,f.kind)&&Xi(f,qf[f.kind],`a ${f.kind} layer of panel ${h}`,i)}for(let[h,u]of[["frame",n.frames],["body",n.bodies],["trajectory set",n.trajectory_sets],["input",n.inputs],["panel",n.panels]])for(let f of Object.keys(u??{}))zh(f,h);let r=new Gi(n),s=h=>r.tree.has(h);for(let[h,u]of Object.entries(n.frames))Array.isArray(u.origin)&&u.origin.forEach(f=>Ua(f,`the origin of frame ${h}`,!1)),Ua(u.rotation?.angle,`the rotation of frame ${h}`,!1),Ua(u.scale,`the scale of frame ${h}`,!1),u.axes!==void 0&&u.axes.length!==3&&T("frame",`frame ${h} has ${u.axes.length} axis labels, not three`);for(let[h,u]of Object.entries(n.bodies??{}))s(u.frame)||T("body",`body ${h} is in frame ${u.frame}, which is not declared`),u.position.forEach(f=>Ua(f,`the position of body ${h}`,!0));Object.keys(n.trajectory_sets).length===0&&T("trajectory-set","the scene does not have a trajectory set");for(let[h,u]of Object.entries(n.trajectory_sets)){s(u.frame)||T("trajectory-set",`trajectory set ${h} is in frame ${u.frame}, which is not declared`),(!Number.isInteger(u.trajectories)||u.trajectories<1)&&T("trajectory-set",`trajectory set ${h} has trajectories ${String(u.trajectories)}, not a count of at least one`),Object.hasOwn(u.channels??{},st)&&T("identifier",`trajectory set ${h} declares a channel named ${st}, which is reserved`),Object.hasOwn(u.parameters??{},Si)&&T("identifier",`trajectory set ${h} declares a parameter named ${Si}, which is reserved`);for(let[f,d]of Object.entries(u.attrs??{}))Mt(d)||T("finite-number",`attribute ${f} of trajectory set ${h} is not finite`)}for(let[h,u]of Object.entries(n.inputs??{})){let f=u.scope;if(f!==void 0&&f!=="shared"&&f!=="per_panel"&&T("input",`input ${h} has scope ${JSON.stringify(f)}, not shared or per_panel`),u.kind==="parameter")typeof u.parameter!="string"&&T("input",`input ${h} is of kind parameter but does not name a parameter`),Mt(u.default)||T("input",`input ${h} defaults to ${String(u.default)}, not a finite number`);else if(u.kind==="choice")u.values.includes(u.default)||T("input",`choice ${h} defaults to ${JSON.stringify(u.default)}, which is not one of its values`),u.labels!==void 0&&u.labels.length!==u.values.length&&T("input",`choice ${h} has ${u.labels.length} labels for ${u.values.length} values`);else if(u.kind==="toggle"){let d=u.default;typeof d!="boolean"&&T("input",`toggle ${h} defaults to ${JSON.stringify(d)}, not a boolean`)}else T("input",`input ${h} has kind ${JSON.stringify(u.kind)}, not parameter, choice, or toggle`)}let o=n.clock;o.mode!=="fraction"&&o.mode!=="epoch"&&T("clock",`the clock mode is ${JSON.stringify(o.mode)}, not fraction or epoch`),(!Number.isInteger(o.frame_count)||o.frame_count<1)&&T("clock",`the clock has frame_count ${String(o.frame_count)}, not a count of at least one`),o.mode==="epoch"?(o.range!==void 0&&o.keyframes!==void 0&&T("clock-keyframes","the clock in epoch mode has both a range and keyframes"),o.range===void 0&&o.keyframes===void 0&&T("clock-mode","the clock is in epoch mode but does not have a range of two numbers or keyframes"),o.range!==void 0&&!o.range.every(Mt)&&T("finite-number","the clock range is not finite"),o.keyframes!==void 0&&li(o.keyframes,"the clock")):o.keyframes!==void 0&&T("clock-keyframes","the clock in fraction mode has keyframes, which only a clock in epoch mode takes"),o.end!==void 0&&o.end!=="loop"&&o.end!=="stop"&&T("steps",`the clock's end is ${JSON.stringify(o.end)}, not loop or stop`);let a=Ct(o),l=-1/0,c=new Set;for(let h of n.steps??[])zh(h.id,"step"),c.has(h.id)&&T("steps",`step ${h.id} is declared twice`),c.add(h.id),(!Mt(h.at)||h.at<0||h.at>a)&&T("steps",`step ${h.id} is at ${String(h.at)}, not a time in [0, ${a}]`),h.at<l&&T("steps",`the steps are not in order of time at ${h.id}`),l=h.at;for(let[h,u]of(n.overlays??[]).entries()){let f=`overlay ${h}`;if((!Array.isArray(u.at)||u.at.length!==2||!u.at.every(Mt))&&T("timeline",`${f} is at ${JSON.stringify(u.at)}, not two fractions`),u.kind==="text")Ba(n,u.text,f),Jf(f,u);else if(u.kind==="legend"){bn(u.opacity,`${f}: the opacity`,Vn,"timeline");for(let d of u.entries){let p=d.label,y=m=>typeof m=="string"||m!==null&&typeof m=="object"&&Object.keys(m).length===1&&(typeof m.sub=="string"||typeof m.sup=="string");typeof p=="string"||Array.isArray(p)&&p.every(y)||T("timeline",`${f} has an entry whose label is not a string or a list of strings and sub and sup parts`),d.marker!==void 0&&Hh(f,d.marker,"timeline"),d.line?.color!==void 0&&!xn.test(d.line.color)&&T("timeline",`${f} has a line color that is not #rrggbb`);for(let m of d.colors??[])xn.test(m)||T("timeline",`${f} has a color ${JSON.stringify(m)} that is not #rrggbb`)}}else T("version",`overlay kind ${JSON.stringify(u.kind)} is not implemented`)}o.labels!==void 0&&o.labels.length!==o.channels.length&&T("clock",`the clock has ${o.labels.length} labels for ${o.channels.length} channels`),o.seconds!==void 0&&!(Mt(o.seconds)&&o.seconds>0)&&T("clock",`the clock seconds are ${JSON.stringify(o.seconds)}, not a positive finite number`),Pt(o);for(let[h,u]of Object.entries(n.panels)){if(typeof u.frame=="string")s(u.frame)||T("panel",`panel ${h} displays ${u.frame}, which is not a frame`);else{Yn(n,u.frame.input,"choice","panel");let p=ht(n,u.frame.input);if(p.kind==="choice")for(let y of p.values)s(y)||T("panel",`the frame of panel ${h} can be ${y}, which is not a frame`)}za(n,u.reference.sets),u.reference.member==="all"&&T("members",`panel ${h}: the member of the reference trajectory is "all", but a reference resolves to one trajectory`),"evenly_spaced"in u.reference.member&&T("members",`panel ${h}: the member of the reference trajectory is evenly_spaced, but a reference resolves to one trajectory`),"input"in u.reference.member&&Yn(n,u.reference.member.input,"parameter","members"),u.camera!==void 0&&u.camera.kind!=="2d"&&u.camera.kind!=="3d"&&T("panel",`panel ${h}: a camera kind is ${JSON.stringify(u.camera.kind)}, not 2d or 3d`);let f=u.camera?.aspect;if(u.camera?.kind==="2d"&&f!==void 0&&f!=="equal"&&f!=="free"&&T("panel",`panel ${h}: a 2d camera's aspect is ${JSON.stringify(f)}, not equal or free`),u.camera?.kind==="2d"&&u.camera.keyframes!==void 0){Ea(u.camera.keyframes,f==="free",`the camera of panel ${h}`);for(let p of u.camera.keyframes)for(let y of p.follow??[])u.layers[y.layer]?.kind!=="trajectories"&&T("camera-keyframes",`panel ${h}: a camera keyframe follows layer ${y.layer}, which is not a trajectories layer of the panel`)}bn(u.opacity,`panel ${h}: the opacity`,Vn);let d=u.margin;if(d!==void 0){for(let p of["top","right","bottom","left"]){let y=d[p];y!==void 0&&!(Mt(y)&&y>=0&&y<1)&&T("timeline",`panel ${h}: the ${p} margin is ${String(y)}, not a fraction in [0, 1)`)}((d.top??0)+(d.bottom??0)>=1||(d.left??0)+(d.right??0)>=1)&&T("timeline",`panel ${h}: the margins leave nothing to draw in`)}if(u.camera?.kind==="3d"){let{stretch:p,auto_rotate:y}=u.camera;p!==void 0&&!(Array.isArray(p)&&p.length===3&&p.every(m=>Mt(m)&&m>0))&&T("panel",`panel ${h}: a 3d camera's stretch is ${JSON.stringify(p)}, not three positive finite factors`),y!==void 0&&!Mt(y)&&T("panel",`panel ${h}: a 3d camera's auto_rotate is ${JSON.stringify(y)}, not a finite number of degrees`)}for(let p of u.layers)if(b0.includes(p.kind)||T("version",`panel ${h}: layer kind ${JSON.stringify(p.kind)} is not implemented`),p.visible!==void 0&&Yn(n,p.visible.input,"toggle","visible"),p.kind==="trajectories")k0(n,h,p);else if(p.kind==="arrow")L0(n,h,p);else if(p.kind==="inset_box")D0(n,h,p);else if(p.kind==="label")P0(n,h,p);else if(p.kind==="points")I0(n,h,p);else if(p.kind==="body")Object.hasOwn(n.bodies??{},p.body)||T("body-layer",`panel ${h} draws ${p.body}, which is not a body`),p.trail!==void 0&&Yf(h,p.trail),p.size!==void 0&&!(p.size>0)&&T("panel",`panel ${h}: a body layer's size is ${p.size}, not positive`),bn(p.opacity,`panel ${h}: a body layer's opacity`,Vn);else if(p.kind==="axes"){p.span!==void 0&&p.span!=="full"&&p.span!=="positive"&&p.span!=="box"&&T("panel",`panel ${h}: an axes layer's span is ${JSON.stringify(p.span)}, not full, positive, or box`),p.ticks!==void 0&&!(Array.isArray(p.ticks)&&p.ticks.every(m=>m==="x"||m==="y"))&&T("timeline",`panel ${h}: an axes layer's ticks are ${JSON.stringify(p.ticks)}, not a list of x and y`),p.size!==void 0&&!Hi(p.size)&&T("timeline",`panel ${h}: an axes layer's size is not positive`);let y=p.titles;if(y!==void 0){(!Array.isArray(y)||y.length!==2)&&T("timeline",`panel ${h}: an axes layer's titles are ${JSON.stringify(y)}, not two texts`);for(let m of y)Ba(n,m,`panel ${h}: an axes title`)}bn(p.opacity,`panel ${h}: an axes layer's opacity`,Vn)}else p.kind==="grid"&&(p.labels!==void 0&&typeof p.labels!="boolean"&&T("panel",`panel ${h}: a grid layer's labels is ${JSON.stringify(p.labels)}, not a boolean`),bn(p.opacity,`panel ${h}: a grid layer's opacity`,Vn))}for(let h of n.controls??[])x0.includes(h.kind)||T("version",`control kind ${JSON.stringify(h.kind)} is not implemented`),h.kind==="slider"?(Yn(n,h.input,"parameter","control"),za(n,h.domain)):h.kind==="tabs"?Yn(n,h.input,"choice","control"):h.kind==="toggle"&&Yn(n,h.input,"toggle","control");for(let h of n.readouts??[])h.place!=="caption"&&h.place!=="panel"&&T("control",`readout place ${JSON.stringify(h.place)} is not caption or panel`),Ba(n,h.parts,"a readout");if(e!==void 0){for(let[f,d]of Object.entries(n.bodies??{}))d.image!==void 0&&(e.has(d.image)||T("body",`body ${f} has image ${JSON.stringify(d.image)}, which the data container does not hold`),e.array(d.image).dtype!=="uint8"&&T("body",`body ${f} has image ${d.image}, which is not an array of uint8 bytes`));let h=new ji(n,e),u=new Set;for(let f of Object.values(n.panels))for(let d of f.layers)"clock"in d&&d.clock!==void 0&&d.clock.channel!==st&&u.add(d.clock.channel);for(let f of Object.keys(n.trajectory_sets)){let d=h.get(f);for(let p of Object.keys(d.def.channels??{}))d.channel(p);for(let p of Object.keys(d.def.parameters??{})){let y=d.parameter(p);for(let m=0;m<d.trajectories;m++)Number.isFinite(y[m])||T("trajectory-set",`parameter ${p} of trajectory set ${f} is not finite at trajectory ${m}`)}for(let p of new Set([...n.clock.channels,...u])){if(p===st||!d.hasChannel(p))continue;let y=d.channel(p);for(let m=0;m<d.trajectories;m++){let g=d.start(m),b=d.count(m),_=Math.sign(y[g+1]-y[g]);for(let x=0;x<b;x++)Number.isFinite(y[g+x])||T("monotone-clock-channel",`clock channel ${p} of trajectory set ${f} is not finite along trajectory ${m} at sample ${x}`),x+1<b&&!((y[g+x+1]-y[g+x])*_>0)&&T("monotone-clock-channel",`clock channel ${p} of trajectory set ${f} is not strictly monotone along trajectory ${m} at sample ${x}`);Number.isFinite(y[g+b-1]-y[g])||T("monotone-clock-channel",`clock channel ${p} of trajectory set ${f} has an infinite span along trajectory ${m}`)}}}}for(let h of t===void 0?[n.initial]:[n.initial,t])N0(n,r,h,i);return i}function N0(n,e,t,i){Kr(n,t);for(let l of br(t.layout))zh(l,"panel");let r=l=>{l.kind!=="panel"&&(l.ratio>0&&l.ratio<1||T("state",`a split ratio is ${String(l.ratio)}, not in (0, 1)`),l.keyframes!==void 0&&li(l.keyframes,"a split",Ma),r(l.a),r(l.b))};r(t.layout);let s=Pt(n.clock),o=(n.readouts??[]).map(l=>({place:l.place,parts:l.parts.filter(c=>typeof c!="string"&&("parameter"in c||"attr"in c||"channel"in c))})).filter(l=>l.parts.length>0),a=br(t.layout)[0];for(let[l,c]of Object.entries(t.panels)){for(let b of Object.keys(c.inputs??{})){let _=ht(n,b);_!==void 0&&_.scope!=="per_panel"&&i.push(`panel ${l} sets ${b}, which is shared and never read there`)}let h=n.panels[c.panel],u={scene:n,state:t,panel:c},f=xr(u,h),d=(b,_,x,M=e.requirements(_,f))=>{let E=n.trajectory_sets[b],v=[...M.channels].filter(L=>L!==st&&!Object.hasOwn(E.channels??{},L)),A=[...M.attrs].filter(L=>!Object.hasOwn(E.attrs??{},L));v.length+A.length>0&&T("transform-channels",`panel ${l}: trajectory set ${b} lacks ${[...v.map(L=>`channel ${L}`),...A.map(L=>`attribute ${L}`)].join(", ")} for ${x} in frame ${f}`);for(let L of Zf(e,n,_,f)){let C=n.frames[L].scale;C!==void 0&&typeof C=="object"&&"attr"in C&&(C.factor??1)*(E.attrs?.[C.attr]??NaN)+(C.offset??0)===0&&T("origin",`panel ${l}: the scale of frame ${L} is zero for trajectory set ${b}`)}},p=(b,_,x)=>{let M=n.trajectory_sets[b],v=(x===void 0?n.clock.channels:[x.channel]).filter(A=>A!==st&&!Object.hasOwn(M.channels??{},A));v.length>0&&T("clock-channel-carried",`panel ${l}: trajectory set ${b}, ${_}, lacks clock channels ${v.join(", ")}`),x===void 0&&s>1&&M.periodic!==!0&&T("revolutions",`panel ${l}: trajectory set ${b}, ${_}, is not periodic, and the clock has ${s} revolutions`)},y=(b,_)=>{let x=n.trajectory_sets[b];if(_==="all"||"evenly_spaced"in _)return;if("index"in _){_.index>=x.trajectories&&T("members",`panel ${l}: member index ${_.index} is not below the trajectory count ${x.trajectories} of trajectory set ${b}`);return}let M=ht(n,_.input);M?.kind==="parameter"&&M.parameter!==Si&&!Object.hasOwn(x.parameters??{},M.parameter)&&T("members",`panel ${l}: trajectory set ${b} lacks parameter ${M.parameter} for input ${_.input}`)},m=Et(u,h.reference.sets);if(m!==null){d(m,n.trajectory_sets[m].frame,"the reference"),p(m,"the reference"),y(m,h.reference.member);let b=n.trajectory_sets[m];for(let _ of o)if(_.place==="panel"||l===a)for(let x of _.parts)"parameter"in x&&x.parameter!==Si&&!Object.hasOwn(b.parameters??{},x.parameter)&&T("control",`the ${_.place} readout through panel ${l} names parameter ${x.parameter}, which trajectory set ${m} lacks`),"attr"in x&&!Object.hasOwn(b.attrs??{},x.attr)&&T("control",`the ${_.place} readout through panel ${l} names attribute ${x.attr}, which trajectory set ${m} lacks`),"channel"in x&&!Object.hasOwn(b.channels??{},x.channel)&&T("control",`the ${_.place} readout through panel ${l} names channel ${x.channel}, which trajectory set ${m} lacks`)}for(let b of h.layers)if(ts(u,b))if(b.kind==="trajectories"){let _=Et(u,b.sets);if(_===null)continue;b.read_from!=="reference"?d(_,n.trajectory_sets[_].frame,"its trajectories"):m!==null&&d(m,n.trajectory_sets[_].frame,`a layer of trajectory set ${_} that reads from the reference`),y(_,b.members),b.highlight!==void 0&&y(_,{input:b.highlight.input});let x=n.trajectory_sets[_];b.color!==void 0&&typeof b.color=="object"&&("channel"in b.color&&!Object.hasOwn(x.channels??{},b.color.channel)&&T("panel",`panel ${l}: trajectory set ${_} lacks channel ${b.color.channel} for a layer's color`),"parameter"in b.color&&!Object.hasOwn(x.parameters??{},b.color.parameter)&&T("panel",`panel ${l}: trajectory set ${_} lacks parameter ${b.color.parameter} for a layer's color`)),typeof b.color=="object"&&"thresholds"in b.color&&!Object.hasOwn(x.channels??{},b.color.channel)&&T("panel",`panel ${l}: trajectory set ${_} lacks channel ${b.color.channel} for a layer's color`);let M=typeof b.head=="object"?b.head.glow:void 0;M!==void 0&&!Object.hasOwn(x.channels??{},M.channel)&&T("timeline",`panel ${l}: trajectory set ${_} lacks channel ${M.channel} for a head's glow`);let E=(b.clock!==void 0||n.clock.mode==="epoch")&&(b.before==="hidden"||b.after==="hidden");((b.reveal??"none")!=="none"||$i(b)||E)&&p(_,"on which a reading is taken",b.clock)}else if(b.kind==="arrow"){let _=Et(u,b.sets);if(_===null)continue;d(_,n.trajectory_sets[_].frame,"its arrows"),y(_,b.members);let x=n.trajectory_sets[_];for(let E of b.vector)E!==st&&!Object.hasOwn(x.channels??{},E)&&T("arrow",`panel ${l}: trajectory set ${_} lacks channel ${E} of an arrow layer's vector`);let M=b.scale;typeof M=="object"&&"attr"in M&&!Object.hasOwn(x.attrs??{},M.attr)&&T("transform-channels",`panel ${l}: trajectory set ${_} lacks attribute ${M.attr} for an arrow layer's scale`),p(_,"on which a reading is taken",b.clock)}else if(b.kind==="points"){let _=Et(u,b.sets);if(_===null)continue;d(_,n.trajectory_sets[_].frame,"its points"),y(_,b.members);let x=(b.clock!==void 0||n.clock.mode==="epoch")&&(b.before==="hidden"||b.after==="hidden");((b.reveal??"none")==="grow"||x)&&p(_,"on which a reading is taken",b.clock)}else if(b.kind==="label"){let _=b.at;if(_.sets!==void 0){let x=Et(u,_.sets);if(x===null)continue;d(x,n.trajectory_sets[x].frame,"a label"),_.member>=n.trajectory_sets[x].trajectories&&T("label",`panel ${l}: a label names member ${_.member}, which is not a trajectory of trajectory set ${x}`),p(x,"on which a label reads",b.clock)}else _.frame!==void 0&&m!==null&&d(m,_.frame,"a label in another frame")}else if(b.kind==="inset_box"&&m!==null){let _=Ca(u,b.panel);_!==null&&d(m,_.frame,`the inset box of panel ${b.panel}`)}else b.kind==="body"&&m!==null&&d(m,n.trajectory_sets[m].frame,`body ${b.body}`,e.bodyRequirements(b.body,f));let g=h.camera;if(g?.kind==="2d"&&g.keyframes!==void 0)for(let b of g.keyframes)for(let _ of b.follow??[]){let x=h.layers[_.layer];if(x?.kind!=="trajectories")continue;let M=Et(u,x.sets);M!==null&&(_.member>=n.trajectory_sets[M].trajectories&&T("camera-keyframes",`panel ${l}: a camera keyframe follows member ${_.member}, which is not a trajectory of trajectory set ${M}`),p(M,"which a camera follows",x.clock))}if(l===a)for(let b of n.controls??[]){if(b.kind!=="slider")continue;let _=ht(n,b.input);if(!(_?.kind!=="parameter"||_.parameter===Si))for(let x of ro(u,b.domain))Object.hasOwn(n.trajectory_sets[x].parameters??{},_.parameter)||T("control",`the slider over ${b.input} has trajectory set ${x} in its domain, which lacks parameter ${_.parameter}`)}}}function Zf(n,e,t,i,r=[]){let{up:s,down:o}=n.tree.path(t,i),a=new Set;for(let l of[...s,...o]){if(r.includes(l))continue;a.add(l);let c=e.frames[l].origin;if(c!==void 0&&!Array.isArray(c)){let h=e.bodies[c.body];for(let u of Zf(n,e,h.frame,e.frames[l].parent,[...r,l]))a.add(u)}}return a}function Qf(n,e,t,i){let r=new ji(n,e),s=new Gi(n);Kr(n,t);let o=Pt(n.clock),a=t.clock.channel,l=Bf(n.clock.frame_count,i),c=Object.create(null);for(let[h,u]of Object.entries(t.panels)){let f=n.panels[u.panel],d={scene:n,state:t,panel:u},p=xr(d,f),y=Et(d,f.reference.sets),m=y===null?null:{set:r.get(y),trajectory:0};if(m){m.trajectory=es(d,f.reference.member,m.set);let x=n.clock.channels.filter(M=>M!==st&&!m.set.hasChannel(M));x.length>0&&T("clock-channel-carried",`the reference trajectory's trajectory set ${m.set.id} lacks clock channels ${x.join(", ")}`),o>1&&!m.set.periodic&&T("revolutions",`the reference trajectory's trajectory set ${m.set.id} is not periodic, and the clock has ${o} revolutions`)}let g={scope:d,frames:s,clock:n.clock,channel:a,q:l,display:p},b=[];for(let x of f.layers)if(O0.includes(x.kind)||T("version",`layer kind ${JSON.stringify(x.kind)} is not implemented`),!!ts(d,x))if(x.kind==="trajectories"){let M=Et(d,x.sets);b.push(Vf(Mi(g,x),x,M===null?null:r.get(M),m))}else if(x.kind==="arrow"){let M=Et(d,x.sets);b.push(Da(Mi(g,x),x,M===null?null:r.get(M)))}else if(x.kind==="inset_box")b.push(ka(g,x,m));else if(x.kind==="body")b.push(Gf(g,x,m));else if(x.kind==="points"){let M=Et(d,x.sets);b.push(Oa(g,x,M===null?null:r.get(M)))}else if(x.kind==="label"){let M=x.at,E=M!==null&&typeof M=="object"&&"sets"in M?Et(d,M.sets):null;b.push(Na(g,x,E===null?null:r.get(E),m))}else b.push({kind:x.kind});let _={frame:p,layers:b};f.camera?.kind==="2d"&&f.camera.keyframes!==void 0&&(_.camera=Gh(g,f,r,m)),c[h]=_}return{panels:c}}var O0=["trajectories","arrow","inset_box","body","axes","grid","label","points"],Kf=new WeakMap;function Gh(n,e,t,i){let r=e.camera,s=r.aspect==="free";(typeof r.keyframes!="object"||r.keyframes===null||Kf.get(r.keyframes)!==s)&&(Ea(r.keyframes,s,"the camera"),Kf.set(r.keyframes,s));let o=r.keyframes,[a,l]=Zr(r),c=Hn(n.clock,n.q);return Ff(o,c,u=>{let f=o[u];if(f.follow===void 0)return f.center??null;let d=0,p=0,y=0;for(let g of f.follow){let b=e.layers[g.layer];(b===void 0||b.kind!=="trajectories")&&T("camera-keyframes",`a camera keyframe follows layer ${g.layer}, which is not a trajectories layer of the panel`);let _=Et(n.scope,b.sets),x=jf(n,b,_===null?null:t.get(_),g.member,i);x!==null&&(p+=x[a],y+=x[l],d++)}if(d===0)return f.center??null;let m=f.offset??[0,0];return[p/d+m[0],y/d+m[1]]})}var F0={viridis:[[.267,.005,.329],[.283,.141,.458],[.254,.265,.53],[.207,.372,.553],[.164,.471,.558],[.128,.567,.551],[.135,.659,.518],[.267,.749,.441],[.478,.821,.318],[.741,.873,.15],[.993,.906,.144]],plasma:[[.05,.03,.528],[.294,.012,.615],[.492,.012,.658],[.665,.139,.586],[.798,.28,.47],[.902,.418,.36],[.973,.585,.252],[.993,.771,.155],[.94,.975,.131]],cividis:[[0,.135,.304],[.086,.218,.396],[.243,.301,.42],[.365,.383,.432],[.478,.466,.448],[.588,.55,.437],[.702,.638,.402],[.822,.73,.343],[.945,.827,.244],[.996,.91,.149]],blues:[[.19,.42,.71],[.33,.6,.8],[.53,.76,.87],[.7,.85,.92],[.85,.93,.98]],reds:[[.72,.1,.1],[.89,.27,.2],[.98,.5,.36],[.99,.7,.58],[1,.86,.78]]};function Mr(n,e,t=[0,0,0]){let i=F0[n],r=Math.max(0,Math.min(1,e))*(i.length-1),s=Math.min(i.length-2,Math.floor(r)),o=r-s;for(let a=0;a<3;a++)t[a]=i[s][a]+(i[s+1][a]-i[s][a])*o;return t}function ep(n,e){let[t,i,r]=Mr(n,e);return`rgb(${Math.round(t*255)},${Math.round(i*255)},${Math.round(r*255)})`}function $t(n,e){let t=n.toLowerCase();return e.sceneForeground!==void 0&&t===e.sceneForeground.toLowerCase()?e.foreground:e.sceneBackground!==void 0&&t===e.sceneBackground.toLowerCase()?e.background:n}function np(n,e){return n===void 0?n:typeof n=="string"?$t(n,e):oo(n)?{...n,colors:n.colors.map(t=>$t(t,e))}:n}function so(n,e){return{...n,...n.color!==void 0?{color:$t(n.color,e)}:{},...n.edge!==void 0?{edge:$t(n.edge,e)}:{}}}var U0={background:"#000000",foreground:"#d8d8d8",grid:"#262626"};function Ga(n){return{...U0,...n.theme??{}}}var B0={dark:{background:"#050505",foreground:"#f2f2ef",grid:"#232320"},light:{background:"#faf8f3",foreground:"#141413",grid:"#e3e0d8"}};function Wh(n){let e=n.trim();if(/^#[0-9a-fA-F]{6}$/.test(e))return e.toLowerCase();if(/^#[0-9a-fA-F]{3}$/.test(e))return`#${[...e.slice(1)].map(a=>a+a).join("")}`.toLowerCase();if(e==="")return null;let t=document.createElement("canvas").getContext?.("2d",{willReadFrequently:!0});if(t==null)return null;let i=a=>(t.fillStyle=a,t.fillStyle=e,t.fillStyle);if(i("#000000")!==i("#ffffff"))return null;t.fillRect(0,0,1,1);let[r,s,o]=t.getImageData(0,0,1,1).data;return`#${[r,s,o].map(a=>a.toString(16).padStart(2,"0")).join("")}`}function ip(n,e,t){let i=e==="dark"||e==="light",r=i?B0[e]:n,s={background:Wh(t("--tycho-background"))??r.background,foreground:Wh(t("--tycho-foreground"))??r.foreground,grid:Wh(t("--tycho-grid"))??r.grid},o=t("--tycho-font")||n.font;return o&&(s.font=o),s.sceneForeground=n.foreground,s.sceneBackground=n.background,n.gutter!==void 0&&(s.gutter=i&&n.gutter.toLowerCase()===n.background.toLowerCase()?s.background:n.gutter),s}var wr={accent:"#f0a050",hover:"#ffb366",press:"#d98a3a",violet:"#c050f0",violetText:"#d98cff",error:"#ff7a7a"};function rp(n){let e=_n(n.background,n.background,0),t=_n(n.foreground,n.foreground,0),i=_n(t,e,.95),r=wt(e).reduce((s,o)=>s+o,0)<1.5;return{"--bg":e,"--fg":t,"--surface":i,"--raised":_n(t,e,.82),"--line":_n(t,e,.8),"--dim":_n(t,e,.287),"--track":_n(t,e,.574),"--gutter":n.gutter??_n(t,e,.9),"--header":`${i}cc`,"--accent":wr.accent,"--accent-hover":wr.hover,"--accent-press":wr.press,"--accent-tint":_n(wr.accent,i,.84),"--accent-2":wr.violet,"--accent-2-text":wr.violetText,"--accent-2-tint":"rgba(192, 80, 240, 0.16)","--error":wr.error,"--highlight":r?"#ffffff":"#000000"}}function wt(n){let e=/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(n);return e===null?[1,1,1]:[parseInt(e[1],16)/255,parseInt(e[2],16)/255,parseInt(e[3],16)/255]}function _n(n,e,t){let i=wt(n),r=wt(e),s=o=>Math.round(255*((1-t)*i[o]+t*r[o])).toString(16).padStart(2,"0");return`#${s(0)}${s(1)}${s(2)}`}function tp(n,e,t=[0,1]){let[i,r]=e,s=r===i?.5:Math.min(1,Math.max(0,(n-i)/(r-i)));return t[0]+s*(t[1]-t[0])}function z0(n){let e=1/0,t=-1/0;for(let i=0;i<n.length;i++){let r=n[i];r<e&&(e=r),r>t&&(t=r)}return e<=t?[e,t]:[0,1]}function H0(n,e){if(typeof n=="string")return n;let t=e?.(n.input);return(t!==void 0&&Object.hasOwn(n.map,t)?n.map[t]:void 0)??Object.values(n.map).find(r=>r!==void 0)??"viridis"}var oo=n=>typeof n=="object"&&n!==null&&"thresholds"in n;function V0(n,e){let t=0;for(;t<n.length&&n[t]<e;)t++;return t}function $h(n,e,t){let i="parameter"in n,r="parameter"in n?n.parameter:n.channel,s="parameter"in n?e.parameter(n.parameter,"panel"):e.channel(n.channel,"panel");return{id:H0(n.colormap,t),name:r,perTrajectory:i,values:s,range:n.range??z0(s),truncate:n.truncate??[0,1]}}function sp(n,e,t,i){if(n===void 0)return{kind:"constant",rgb:t};if(typeof n=="string")return{kind:"constant",rgb:wt(n)};if(oo(n)){let a=e.channel(n.channel,"panel"),l=n.colors.map(wt),c=new Float32Array(3*e.samples);for(let h=0;h<e.samples;h++)c.set(l[V0(n.thresholds,a[h])],3*h);return{kind:"sample",rgb:c}}let r=$h(n,e,i),s=new Float32Array(3*e.samples),o=[0,0,0];if(r.perTrajectory)for(let a=0;a<e.trajectories;a++){Mr(r.id,tp(r.values[a],r.range,r.truncate),o);for(let l=e.start(a);l<e.start(a)+e.count(a);l++)s.set(o,3*l)}else for(let a=0;a<e.samples;a++)s.set(Mr(r.id,tp(r.values[a],r.range,r.truncate),o),3*a);return{kind:"sample",rgb:s}}function jh(n,e=12){let t=[],i=[0,0,0];for(let r=0;r<e;r++){let s=r/(e-1);Mr(n.id,n.truncate[0]+s*(n.truncate[1]-n.truncate[0]),i),t.push([s,`rgb(${i.map(o=>Math.round(255*o)).join(",")})`])}return t}function op(n,e=12){return`linear-gradient(to top, ${jh(n,e).map(([t,i])=>`${i} ${(100*t).toFixed(1)}%`).join(", ")})`}var iu=(n,e,t)=>{if(!e.has(n))throw TypeError("Cannot "+t)},N=(n,e,t)=>(iu(n,e,"read from private field"),t?t.call(n):e.get(n)),$e=(n,e,t)=>{if(e.has(n))throw TypeError("Cannot add the same private member more than once");e instanceof WeakSet?e.add(n):e.set(n,t)},Xt=(n,e,t,i)=>(iu(n,e,"write to private field"),i?i.call(n,t):e.set(n,t),t),G0=(n,e,t,i)=>({set _(r){Xt(n,e,r,t)},get _(){return N(n,e,i)}}),Qe=(n,e,t)=>(iu(n,e,"access private method"),t),et=new Uint8Array(8),fi=new DataView(et.buffer),Ft=n=>[(n%256+256)%256],it=n=>(fi.setUint16(0,n,!1),[et[0],et[1]]),W0=n=>(fi.setInt16(0,n,!1),[et[0],et[1]]),lp=n=>(fi.setUint32(0,n,!1),[et[1],et[2],et[3]]),_e=n=>(fi.setUint32(0,n,!1),[et[0],et[1],et[2],et[3]]),$0=n=>(fi.setInt32(0,n,!1),[et[0],et[1],et[2],et[3]]),Pr=n=>(fi.setUint32(0,Math.floor(n/2**32),!1),fi.setUint32(4,n,!1),[et[0],et[1],et[2],et[3],et[4],et[5],et[6],et[7]]),ru=n=>(fi.setInt16(0,2**8*n,!1),[et[0],et[1]]),ui=n=>(fi.setInt32(0,2**16*n,!1),[et[0],et[1],et[2],et[3]]),Xh=n=>(fi.setInt32(0,2**30*n,!1),[et[0],et[1],et[2],et[3]]),Gn=(n,e=!1)=>{let t=Array(n.length).fill(null).map((i,r)=>n.charCodeAt(r));return e&&t.push(0),t},Ya=n=>n&&n[n.length-1],su=n=>{let e;for(let t of n)(!e||t.presentationTimestamp>e.presentationTimestamp)&&(e=t);return e},di=(n,e,t=!0)=>{let i=n*e;return t?Math.round(i):i},cp=n=>{let e=n*(Math.PI/180),t=Math.cos(e),i=Math.sin(e);return[t,i,0,-i,t,0,0,0,1]},hp=cp(0),up=n=>[ui(n[0]),ui(n[1]),Xh(n[2]),ui(n[3]),ui(n[4]),Xh(n[5]),ui(n[6]),ui(n[7]),Xh(n[8])],co=n=>!n||typeof n!="object"?n:Array.isArray(n)?n.map(co):Object.fromEntries(Object.entries(n).map(([e,t])=>[e,co(t)])),os=n=>n>=0&&n<2**32,Lt=(n,e,t)=>({type:n,contents:e&&new Uint8Array(e.flat(10)),children:t}),mt=(n,e,t,i,r)=>Lt(n,[Ft(e),lp(t),i??[]],r),j0=n=>{let e=512;return n.fragmented?Lt("ftyp",[Gn("iso5"),_e(e),Gn("iso5"),Gn("iso6"),Gn("mp41")]):Lt("ftyp",[Gn("isom"),_e(e),Gn("isom"),n.holdsAvc?Gn("avc1"):[],Gn("mp41")])},qh=n=>({type:"mdat",largeSize:n}),X0=n=>({type:"free",size:n}),Wa=(n,e,t=!1)=>Lt("moov",null,[q0(e,n),...n.map(i=>Y0(i,e)),t?Tb(n):null]),q0=(n,e)=>{let t=di(Math.max(0,...e.filter(o=>o.samples.length>0).map(o=>{let a=su(o.samples);return a.presentationTimestamp+a.duration})),Zh),i=Math.max(...e.map(o=>o.id))+1,r=!os(n)||!os(t),s=r?Pr:_e;return mt("mvhd",+r,0,[s(n),s(n),_e(Zh),s(t),ui(1),ru(1),Array(10).fill(0),up(hp),Array(24).fill(0),_e(i)])},Y0=(n,e)=>Lt("trak",null,[J0(n,e),Z0(n,e)]),J0=(n,e)=>{let t=su(n.samples),i=di(t?t.presentationTimestamp+t.duration:0,Zh),r=!os(e)||!os(i),s=r?Pr:_e,o;return n.info.type==="video"?o=typeof n.info.rotation=="number"?cp(n.info.rotation):n.info.rotation:o=hp,mt("tkhd",+r,3,[s(e),s(e),_e(n.id),_e(0),s(i),Array(8).fill(0),it(0),it(0),ru(n.info.type==="audio"?1:0),it(0),up(o),ui(n.info.type==="video"?n.info.width:0),ui(n.info.type==="video"?n.info.height:0)])},Z0=(n,e)=>Lt("mdia",null,[K0(n,e),Q0(n.info.type==="video"?"vide":"soun"),eb(n)]),K0=(n,e)=>{let t=su(n.samples),i=di(t?t.presentationTimestamp+t.duration:0,n.timescale),r=!os(e)||!os(i),s=r?Pr:_e;return mt("mdhd",+r,0,[s(e),s(e),_e(n.timescale),s(i),it(21956),it(0)])},Q0=n=>mt("hdlr",0,0,[Gn("mhlr"),Gn(n),_e(0),_e(0),_e(0),Gn("mp4-muxer-hdlr",!0)]),eb=n=>Lt("minf",null,[n.info.type==="video"?tb():nb(),ib(),ob(n)]),tb=()=>mt("vmhd",0,1,[it(0),it(0),it(0),it(0)]),nb=()=>mt("smhd",0,0,[it(0),it(0)]),ib=()=>Lt("dinf",null,[rb()]),rb=()=>mt("dref",0,0,[_e(1)],[sb()]),sb=()=>mt("url ",0,1),ob=n=>{let e=n.compositionTimeOffsetTable.length>1||n.compositionTimeOffsetTable.some(t=>t.sampleCompositionTimeOffset!==0);return Lt("stbl",null,[ab(n),vb(n),_b(n),Sb(n),Mb(n),wb(n),e?Eb(n):null])},ab=n=>mt("stsd",0,0,[_e(1)],[n.info.type==="video"?lb(Ob[n.info.codec],n):yb(Ub[n.info.codec],n)]),lb=(n,e)=>Lt(n,[Array(6).fill(0),it(1),it(0),it(0),Array(12).fill(0),it(e.info.width),it(e.info.height),_e(4718592),_e(4718592),_e(0),it(1),Array(32).fill(0),it(24),W0(65535)],[Fb[e.info.codec](e),e.info.decoderConfig.colorSpace?db(e):null]),cb={bt709:1,bt470bg:5,smpte170m:6},hb={bt709:1,smpte170m:6,"iec61966-2-1":13},ub={rgb:0,bt709:1,bt470bg:5,smpte170m:6},db=n=>Lt("colr",[Gn("nclx"),it(cb[n.info.decoderConfig.colorSpace.primaries]),it(hb[n.info.decoderConfig.colorSpace.transfer]),it(ub[n.info.decoderConfig.colorSpace.matrix]),Ft((n.info.decoderConfig.colorSpace.fullRange?1:0)<<7)]),fb=n=>n.info.decoderConfig&&Lt("avcC",[...new Uint8Array(n.info.decoderConfig.description)]),pb=n=>n.info.decoderConfig&&Lt("hvcC",[...new Uint8Array(n.info.decoderConfig.description)]),mb=n=>{if(!n.info.decoderConfig)return null;let e=n.info.decoderConfig;if(!e.colorSpace)throw new Error("'colorSpace' is required in the decoder config for VP9.");let t=e.codec.split("."),i=Number(t[1]),r=Number(t[2]),a=(Number(t[3])<<4)+(0<<1)+Number(e.colorSpace.fullRange);return mt("vpcC",1,0,[Ft(i),Ft(r),Ft(a),Ft(2),Ft(2),Ft(2),it(0)])},gb=()=>{let t=(1<<7)+1;return Lt("av1C",[t,0,0,0])},yb=(n,e)=>Lt(n,[Array(6).fill(0),it(1),it(0),it(0),_e(0),it(e.info.numberOfChannels),it(16),it(0),it(0),ui(e.info.sampleRate)],[Bb[e.info.codec](e)]),bb=n=>{let e=new Uint8Array(n.info.decoderConfig.description);return mt("esds",0,0,[_e(58753152),Ft(32+e.byteLength),it(1),Ft(0),_e(75530368),Ft(18+e.byteLength),Ft(64),Ft(21),lp(0),_e(130071),_e(130071),_e(92307584),Ft(e.byteLength),...e,_e(109084800),Ft(1),Ft(2)])},xb=n=>{let e=3840,t=0,i=n.info.decoderConfig?.description;if(i){if(i.byteLength<18)throw new TypeError("Invalid decoder description provided for Opus; must be at least 18 bytes long.");let r=ArrayBuffer.isView(i)?new DataView(i.buffer,i.byteOffset,i.byteLength):new DataView(i);e=r.getUint16(10,!0),t=r.getInt16(14,!0)}return Lt("dOps",[Ft(0),Ft(n.info.numberOfChannels),it(e),_e(n.info.sampleRate),ru(t),Ft(0)])},vb=n=>mt("stts",0,0,[_e(n.timeToSampleTable.length),n.timeToSampleTable.map(e=>[_e(e.sampleCount),_e(e.sampleDelta)])]),_b=n=>{if(n.samples.every(t=>t.type==="key"))return null;let e=[...n.samples.entries()].filter(([,t])=>t.type==="key");return mt("stss",0,0,[_e(e.length),e.map(([t])=>_e(t+1))])},Sb=n=>mt("stsc",0,0,[_e(n.compactlyCodedChunkTable.length),n.compactlyCodedChunkTable.map(e=>[_e(e.firstChunk),_e(e.samplesPerChunk),_e(1)])]),Mb=n=>mt("stsz",0,0,[_e(0),_e(n.samples.length),n.samples.map(e=>_e(e.size))]),wb=n=>n.finalizedChunks.length>0&&Ya(n.finalizedChunks).offset>=2**32?mt("co64",0,0,[_e(n.finalizedChunks.length),n.finalizedChunks.map(e=>Pr(e.offset))]):mt("stco",0,0,[_e(n.finalizedChunks.length),n.finalizedChunks.map(e=>_e(e.offset))]),Eb=n=>mt("ctts",0,0,[_e(n.compositionTimeOffsetTable.length),n.compositionTimeOffsetTable.map(e=>[_e(e.sampleCount),_e(e.sampleCompositionTimeOffset)])]),Tb=n=>Lt("mvex",null,n.map(Ab)),Ab=n=>mt("trex",0,0,[_e(n.id),_e(1),_e(0),_e(0),_e(0)]),ap=(n,e)=>Lt("moof",null,[Rb(n),...e.map(Cb)]),Rb=n=>mt("mfhd",0,0,[_e(n)]),dp=n=>{let e=0,t=0,i=0,r=0,s=n.type==="delta";return t|=+s,s?e|=1:e|=2,e<<24|t<<16|i<<8|r},Cb=n=>Lt("traf",null,[Pb(n),Ib(n),Lb(n)]),Pb=n=>{let e=0;e|=8,e|=16,e|=32,e|=131072;let t=n.currentChunk.samples[1]??n.currentChunk.samples[0],i={duration:t.timescaleUnitsToNextSample,size:t.size,flags:dp(t)};return mt("tfhd",0,e,[_e(n.id),_e(i.duration),_e(i.size),_e(i.flags)])},Ib=n=>mt("tfdt",1,0,[Pr(di(n.currentChunk.startTimestamp,n.timescale))]),Lb=n=>{let e=n.currentChunk.samples.map(y=>y.timescaleUnitsToNextSample),t=n.currentChunk.samples.map(y=>y.size),i=n.currentChunk.samples.map(dp),r=n.currentChunk.samples.map(y=>di(y.presentationTimestamp-y.decodeTimestamp,n.timescale)),s=new Set(e),o=new Set(t),a=new Set(i),l=new Set(r),c=a.size===2&&i[0]!==i[1],h=s.size>1,u=o.size>1,f=!c&&a.size>1,d=l.size>1||[...l].some(y=>y!==0),p=0;return p|=1,p|=4*+c,p|=256*+h,p|=512*+u,p|=1024*+f,p|=2048*+d,mt("trun",1,p,[_e(n.currentChunk.samples.length),_e(n.currentChunk.offset-n.currentChunk.moofOffset||0),c?_e(i[0]):[],n.currentChunk.samples.map((y,m)=>[h?_e(e[m]):[],u?_e(t[m]):[],f?_e(i[m]):[],d?$0(r[m]):[]])])},Db=n=>Lt("mfra",null,[...n.map(kb),Nb()]),kb=(n,e)=>mt("tfra",1,0,[_e(n.id),_e(63),_e(n.finalizedChunks.length),n.finalizedChunks.map(i=>[Pr(di(i.startTimestamp,n.timescale)),Pr(i.moofOffset),_e(e+1),_e(1),_e(1)])]),Nb=()=>mt("mfro",0,0,[_e(0)]),Ob={avc:"avc1",hevc:"hvc1",vp9:"vp09",av1:"av01"},Fb={avc:fb,hevc:pb,vp9:mb,av1:gb},Ub={aac:"mp4a",opus:"Opus"},Bb={aac:bb,opus:xb};var tl=class{},ou=class extends tl{constructor(){super(...arguments),this.buffer=null}},fp=class extends tl{constructor(n){if(super(),this.options=n,typeof n!="object")throw new TypeError("StreamTarget requires an options object to be passed to its constructor.");if(n.onData){if(typeof n.onData!="function")throw new TypeError("options.onData, when provided, must be a function.");if(n.onData.length<2)throw new TypeError("options.onData, when provided, must be a function that takes in at least two arguments (data and position). Ignoring the position argument, which specifies the byte offset at which the data is to be written, can lead to broken outputs.")}if(n.chunked!==void 0&&typeof n.chunked!="boolean")throw new TypeError("options.chunked, when provided, must be a boolean.");if(n.chunkSize!==void 0&&(!Number.isInteger(n.chunkSize)||n.chunkSize<1024))throw new TypeError("options.chunkSize, when provided, must be an integer and not smaller than 1024.")}},zb=class extends tl{constructor(n,e){if(super(),this.stream=n,this.options=e,!(n instanceof FileSystemWritableFileStream))throw new TypeError("FileSystemWritableFileStreamTarget requires a FileSystemWritableFileStream instance.");if(e!==void 0&&typeof e!="object")throw new TypeError("FileSystemWritableFileStreamTarget's options, when provided, must be an object.");if(e&&e.chunkSize!==void 0&&(!Number.isInteger(e.chunkSize)||e.chunkSize<=0))throw new TypeError("options.chunkSize, when provided, must be a positive integer")}},Er,is,pp=class{constructor(){this.pos=0,$e(this,Er,new Uint8Array(8)),$e(this,is,new DataView(N(this,Er).buffer)),this.offsets=new WeakMap}seek(n){this.pos=n}writeU32(n){N(this,is).setUint32(0,n,!1),this.write(N(this,Er).subarray(0,4))}writeU64(n){N(this,is).setUint32(0,Math.floor(n/2**32),!1),N(this,is).setUint32(4,n,!1),this.write(N(this,Er).subarray(0,8))}writeAscii(n){for(let e=0;e<n.length;e++)N(this,is).setUint8(e%8,n.charCodeAt(e)),e%8===7&&this.write(N(this,Er));n.length%8!==0&&this.write(N(this,Er).subarray(0,n.length%8))}writeBox(n){if(this.offsets.set(n,this.pos),n.contents&&!n.children)this.writeBoxHeader(n,n.size??n.contents.byteLength+8),this.write(n.contents);else{let e=this.pos;if(this.writeBoxHeader(n,0),n.contents&&this.write(n.contents),n.children)for(let r of n.children)r&&this.writeBox(r);let t=this.pos,i=n.size??t-e;this.seek(e),this.writeBoxHeader(n,i),this.seek(t)}}writeBoxHeader(n,e){this.writeU32(n.largeSize?1:e),this.writeAscii(n.type),n.largeSize&&this.writeU64(e)}measureBoxHeader(n){return 8+(n.largeSize?8:0)}patchBox(n){let e=this.pos;this.seek(this.offsets.get(n)),this.writeBox(n),this.seek(e)}measureBox(n){if(n.contents&&!n.children)return this.measureBoxHeader(n)+n.contents.byteLength;{let e=this.measureBoxHeader(n);if(n.contents&&(e+=n.contents.byteLength),n.children)for(let t of n.children)t&&(e+=this.measureBox(t));return e}}};Er=new WeakMap;is=new WeakMap;var $a,Cr,mo,ao,ja,Yh,Hb=class extends pp{constructor(n){super(),$e(this,ja),$e(this,$a,void 0),$e(this,Cr,new ArrayBuffer(2**16)),$e(this,mo,new Uint8Array(N(this,Cr))),$e(this,ao,0),Xt(this,$a,n)}write(n){Qe(this,ja,Yh).call(this,this.pos+n.byteLength),N(this,mo).set(n,this.pos),this.pos+=n.byteLength,Xt(this,ao,Math.max(N(this,ao),this.pos))}finalize(){Qe(this,ja,Yh).call(this,this.pos),N(this,$a).buffer=N(this,Cr).slice(0,Math.max(N(this,ao),this.pos))}};$a=new WeakMap;Cr=new WeakMap;mo=new WeakMap;ao=new WeakMap;ja=new WeakSet;Yh=function(n){let e=N(this,Cr).byteLength;for(;e<n;)e*=2;if(e===N(this,Cr).byteLength)return;let t=new ArrayBuffer(e),i=new Uint8Array(t);i.set(N(this,mo),0),Xt(this,Cr,t),Xt(this,mo,i)};var Vb=2**24,Gb=2,ho,Tr,lo,Ei,Mn,Ja,Jh,au,mp,lu,gp,uo,Za,cu=class extends pp{constructor(n){super(),$e(this,Ja),$e(this,au),$e(this,lu),$e(this,uo),$e(this,ho,void 0),$e(this,Tr,[]),$e(this,lo,void 0),$e(this,Ei,void 0),$e(this,Mn,[]),Xt(this,ho,n),Xt(this,lo,n.options?.chunked??!1),Xt(this,Ei,n.options?.chunkSize??Vb)}write(n){N(this,Tr).push({data:n.slice(),start:this.pos}),this.pos+=n.byteLength}flush(){if(N(this,Tr).length===0)return;let n=[],e=[...N(this,Tr)].sort((t,i)=>t.start-i.start);n.push({start:e[0].start,size:e[0].data.byteLength});for(let t=1;t<e.length;t++){let i=n[n.length-1],r=e[t];r.start<=i.start+i.size?i.size=Math.max(i.size,r.start+r.data.byteLength-i.start):n.push({start:r.start,size:r.data.byteLength})}for(let t of n){t.data=new Uint8Array(t.size);for(let i of N(this,Tr))t.start<=i.start&&i.start<t.start+t.size&&t.data.set(i.data,i.start-t.start);N(this,lo)?(Qe(this,Ja,Jh).call(this,t.data,t.start),Qe(this,uo,Za).call(this)):N(this,ho).options.onData?.(t.data,t.start)}N(this,Tr).length=0}finalize(){N(this,lo)&&Qe(this,uo,Za).call(this,!0)}};ho=new WeakMap;Tr=new WeakMap;lo=new WeakMap;Ei=new WeakMap;Mn=new WeakMap;Ja=new WeakSet;Jh=function(n,e){let t=N(this,Mn).findIndex(a=>a.start<=e&&e<a.start+N(this,Ei));t===-1&&(t=Qe(this,lu,gp).call(this,e));let i=N(this,Mn)[t],r=e-i.start,s=n.subarray(0,Math.min(N(this,Ei)-r,n.byteLength));i.data.set(s,r);let o={start:r,end:r+s.byteLength};if(Qe(this,au,mp).call(this,i,o),i.written[0].start===0&&i.written[0].end===N(this,Ei)&&(i.shouldFlush=!0),N(this,Mn).length>Gb){for(let a=0;a<N(this,Mn).length-1;a++)N(this,Mn)[a].shouldFlush=!0;Qe(this,uo,Za).call(this)}s.byteLength<n.byteLength&&Qe(this,Ja,Jh).call(this,n.subarray(s.byteLength),e+s.byteLength)};au=new WeakSet;mp=function(n,e){let t=0,i=n.written.length-1,r=-1;for(;t<=i;){let s=Math.floor(t+(i-t+1)/2);n.written[s].start<=e.start?(t=s+1,r=s):i=s-1}for(n.written.splice(r+1,0,e),(r===-1||n.written[r].end<e.start)&&r++;r<n.written.length-1&&n.written[r].end>=n.written[r+1].start;)n.written[r].end=Math.max(n.written[r].end,n.written[r+1].end),n.written.splice(r+1,1)};lu=new WeakSet;gp=function(n){let t={start:Math.floor(n/N(this,Ei))*N(this,Ei),data:new Uint8Array(N(this,Ei)),written:[],shouldFlush:!1};return N(this,Mn).push(t),N(this,Mn).sort((i,r)=>i.start-r.start),N(this,Mn).indexOf(t)};uo=new WeakSet;Za=function(n=!1){for(let e=0;e<N(this,Mn).length;e++){let t=N(this,Mn)[e];if(!(!t.shouldFlush&&!n)){for(let i of t.written)N(this,ho).options.onData?.(t.data.subarray(i.start,i.end),t.start+i.start);N(this,Mn).splice(e--,1)}}};var Wb=class extends cu{constructor(n){super(new fp({onData:(e,t)=>n.stream.write({type:"write",data:e,position:t}),chunked:!0,chunkSize:n.options?.chunkSize}))}},Zh=1e3,$b=["avc","hevc","vp9","av1"],jb=["aac","opus"],Xb=2082844800,qb=["strict","offset","cross-track-offset"],Re,Oe,Ka,Sn,en,jt,rs,ss,hu,Ar,Rr,fo,Kh,yp,Qh,bp,uu,xp,eu,vp,du,_p,Xa,tu,hi,wi,fu,Sp,po,Qa,el,pu,as,go,qa,nu,Mp=class{constructor(n){if($e(this,Kh),$e(this,Qh),$e(this,uu),$e(this,eu),$e(this,du),$e(this,Xa),$e(this,hi),$e(this,fu),$e(this,po),$e(this,el),$e(this,as),$e(this,qa),$e(this,Re,void 0),$e(this,Oe,void 0),$e(this,Ka,void 0),$e(this,Sn,void 0),$e(this,en,null),$e(this,jt,null),$e(this,rs,Math.floor(Date.now()/1e3)+Xb),$e(this,ss,[]),$e(this,hu,1),$e(this,Ar,[]),$e(this,Rr,[]),$e(this,fo,!1),Qe(this,Kh,yp).call(this,n),n.video=co(n.video),n.audio=co(n.audio),n.fastStart=co(n.fastStart),this.target=n.target,Xt(this,Re,{firstTimestampBehavior:"strict",...n}),n.target instanceof ou)Xt(this,Oe,new Hb(n.target));else if(n.target instanceof fp)Xt(this,Oe,new cu(n.target));else if(n.target instanceof zb)Xt(this,Oe,new Wb(n.target));else throw new Error(`Invalid target: ${n.target}`);Qe(this,eu,vp).call(this),Qe(this,Qh,bp).call(this)}addVideoChunk(n,e,t,i){if(!(n instanceof EncodedVideoChunk))throw new TypeError("addVideoChunk's first argument (sample) must be of type EncodedVideoChunk.");if(e&&typeof e!="object")throw new TypeError("addVideoChunk's second argument (meta), when provided, must be an object.");if(t!==void 0&&(!Number.isFinite(t)||t<0))throw new TypeError("addVideoChunk's third argument (timestamp), when provided, must be a non-negative real number.");if(i!==void 0&&!Number.isFinite(i))throw new TypeError("addVideoChunk's fourth argument (compositionTimeOffset), when provided, must be a real number.");let r=new Uint8Array(n.byteLength);n.copyTo(r),this.addVideoChunkRaw(r,n.type,t??n.timestamp,n.duration,e,i)}addVideoChunkRaw(n,e,t,i,r,s){if(!(n instanceof Uint8Array))throw new TypeError("addVideoChunkRaw's first argument (data) must be an instance of Uint8Array.");if(e!=="key"&&e!=="delta")throw new TypeError("addVideoChunkRaw's second argument (type) must be either 'key' or 'delta'.");if(!Number.isFinite(t)||t<0)throw new TypeError("addVideoChunkRaw's third argument (timestamp) must be a non-negative real number.");if(!Number.isFinite(i)||i<0)throw new TypeError("addVideoChunkRaw's fourth argument (duration) must be a non-negative real number.");if(r&&typeof r!="object")throw new TypeError("addVideoChunkRaw's fifth argument (meta), when provided, must be an object.");if(s!==void 0&&!Number.isFinite(s))throw new TypeError("addVideoChunkRaw's sixth argument (compositionTimeOffset), when provided, must be a real number.");if(Qe(this,qa,nu).call(this),!N(this,Re).video)throw new Error("No video track declared.");if(typeof N(this,Re).fastStart=="object"&&N(this,en).samples.length===N(this,Re).fastStart.expectedVideoChunks)throw new Error(`Cannot add more video chunks than specified in 'fastStart' (${N(this,Re).fastStart.expectedVideoChunks}).`);let o=Qe(this,Xa,tu).call(this,N(this,en),n,e,t,i,r,s);if(N(this,Re).fastStart==="fragmented"&&N(this,jt)){for(;N(this,Rr).length>0&&N(this,Rr)[0].decodeTimestamp<=o.decodeTimestamp;){let a=N(this,Rr).shift();Qe(this,hi,wi).call(this,N(this,jt),a)}o.decodeTimestamp<=N(this,jt).lastDecodeTimestamp?Qe(this,hi,wi).call(this,N(this,en),o):N(this,Ar).push(o)}else Qe(this,hi,wi).call(this,N(this,en),o)}addAudioChunk(n,e,t){if(!(n instanceof EncodedAudioChunk))throw new TypeError("addAudioChunk's first argument (sample) must be of type EncodedAudioChunk.");if(e&&typeof e!="object")throw new TypeError("addAudioChunk's second argument (meta), when provided, must be an object.");if(t!==void 0&&(!Number.isFinite(t)||t<0))throw new TypeError("addAudioChunk's third argument (timestamp), when provided, must be a non-negative real number.");let i=new Uint8Array(n.byteLength);n.copyTo(i),this.addAudioChunkRaw(i,n.type,t??n.timestamp,n.duration,e)}addAudioChunkRaw(n,e,t,i,r){if(!(n instanceof Uint8Array))throw new TypeError("addAudioChunkRaw's first argument (data) must be an instance of Uint8Array.");if(e!=="key"&&e!=="delta")throw new TypeError("addAudioChunkRaw's second argument (type) must be either 'key' or 'delta'.");if(!Number.isFinite(t)||t<0)throw new TypeError("addAudioChunkRaw's third argument (timestamp) must be a non-negative real number.");if(!Number.isFinite(i)||i<0)throw new TypeError("addAudioChunkRaw's fourth argument (duration) must be a non-negative real number.");if(r&&typeof r!="object")throw new TypeError("addAudioChunkRaw's fifth argument (meta), when provided, must be an object.");if(Qe(this,qa,nu).call(this),!N(this,Re).audio)throw new Error("No audio track declared.");if(typeof N(this,Re).fastStart=="object"&&N(this,jt).samples.length===N(this,Re).fastStart.expectedAudioChunks)throw new Error(`Cannot add more audio chunks than specified in 'fastStart' (${N(this,Re).fastStart.expectedAudioChunks}).`);let s=Qe(this,Xa,tu).call(this,N(this,jt),n,e,t,i,r);if(N(this,Re).fastStart==="fragmented"&&N(this,en)){for(;N(this,Ar).length>0&&N(this,Ar)[0].decodeTimestamp<=s.decodeTimestamp;){let o=N(this,Ar).shift();Qe(this,hi,wi).call(this,N(this,en),o)}s.decodeTimestamp<=N(this,en).lastDecodeTimestamp?Qe(this,hi,wi).call(this,N(this,jt),s):N(this,Rr).push(s)}else Qe(this,hi,wi).call(this,N(this,jt),s)}finalize(){if(N(this,fo))throw new Error("Cannot finalize a muxer more than once.");if(N(this,Re).fastStart==="fragmented"){for(let e of N(this,Ar))Qe(this,hi,wi).call(this,N(this,en),e);for(let e of N(this,Rr))Qe(this,hi,wi).call(this,N(this,jt),e);Qe(this,el,pu).call(this,!1)}else N(this,en)&&Qe(this,po,Qa).call(this,N(this,en)),N(this,jt)&&Qe(this,po,Qa).call(this,N(this,jt));let n=[N(this,en),N(this,jt)].filter(Boolean);if(N(this,Re).fastStart==="in-memory"){let e;for(let i=0;i<2;i++){let r=Wa(n,N(this,rs)),s=N(this,Oe).measureBox(r);e=N(this,Oe).measureBox(N(this,Sn));let o=N(this,Oe).pos+s+e;for(let a of N(this,ss)){a.offset=o;for(let{data:l}of a.samples)o+=l.byteLength,e+=l.byteLength}if(o<2**32)break;e>=2**32&&(N(this,Sn).largeSize=!0)}let t=Wa(n,N(this,rs));N(this,Oe).writeBox(t),N(this,Sn).size=e,N(this,Oe).writeBox(N(this,Sn));for(let i of N(this,ss))for(let r of i.samples)N(this,Oe).write(r.data),r.data=null}else if(N(this,Re).fastStart==="fragmented"){let e=N(this,Oe).pos,t=Db(n);N(this,Oe).writeBox(t);let i=N(this,Oe).pos-e;N(this,Oe).seek(N(this,Oe).pos-4),N(this,Oe).writeU32(i)}else{let e=N(this,Oe).offsets.get(N(this,Sn)),t=N(this,Oe).pos-e;N(this,Sn).size=t,N(this,Sn).largeSize=t>=2**32,N(this,Oe).patchBox(N(this,Sn));let i=Wa(n,N(this,rs));if(typeof N(this,Re).fastStart=="object"){N(this,Oe).seek(N(this,Ka)),N(this,Oe).writeBox(i);let r=e-N(this,Oe).pos;N(this,Oe).writeBox(X0(r))}else N(this,Oe).writeBox(i)}Qe(this,as,go).call(this),N(this,Oe).finalize(),Xt(this,fo,!0)}};Re=new WeakMap;Oe=new WeakMap;Ka=new WeakMap;Sn=new WeakMap;en=new WeakMap;jt=new WeakMap;rs=new WeakMap;ss=new WeakMap;hu=new WeakMap;Ar=new WeakMap;Rr=new WeakMap;fo=new WeakMap;Kh=new WeakSet;yp=function(n){if(typeof n!="object")throw new TypeError("The muxer requires an options object to be passed to its constructor.");if(!(n.target instanceof tl))throw new TypeError("The target must be provided and an instance of Target.");if(n.video){if(!$b.includes(n.video.codec))throw new TypeError(`Unsupported video codec: ${n.video.codec}`);if(!Number.isInteger(n.video.width)||n.video.width<=0)throw new TypeError(`Invalid video width: ${n.video.width}. Must be a positive integer.`);if(!Number.isInteger(n.video.height)||n.video.height<=0)throw new TypeError(`Invalid video height: ${n.video.height}. Must be a positive integer.`);let e=n.video.rotation;if(typeof e=="number"&&![0,90,180,270].includes(e))throw new TypeError(`Invalid video rotation: ${e}. Has to be 0, 90, 180 or 270.`);if(Array.isArray(e)&&(e.length!==9||e.some(t=>typeof t!="number")))throw new TypeError(`Invalid video transformation matrix: ${e.join()}`);if(n.video.frameRate!==void 0&&(!Number.isInteger(n.video.frameRate)||n.video.frameRate<=0))throw new TypeError(`Invalid video frame rate: ${n.video.frameRate}. Must be a positive integer.`)}if(n.audio){if(!jb.includes(n.audio.codec))throw new TypeError(`Unsupported audio codec: ${n.audio.codec}`);if(!Number.isInteger(n.audio.numberOfChannels)||n.audio.numberOfChannels<=0)throw new TypeError(`Invalid number of audio channels: ${n.audio.numberOfChannels}. Must be a positive integer.`);if(!Number.isInteger(n.audio.sampleRate)||n.audio.sampleRate<=0)throw new TypeError(`Invalid audio sample rate: ${n.audio.sampleRate}. Must be a positive integer.`)}if(n.firstTimestampBehavior&&!qb.includes(n.firstTimestampBehavior))throw new TypeError(`Invalid first timestamp behavior: ${n.firstTimestampBehavior}`);if(typeof n.fastStart=="object"){if(n.video){if(n.fastStart.expectedVideoChunks===void 0)throw new TypeError("'fastStart' is an object but is missing property 'expectedVideoChunks'.");if(!Number.isInteger(n.fastStart.expectedVideoChunks)||n.fastStart.expectedVideoChunks<0)throw new TypeError("'expectedVideoChunks' must be a non-negative integer.")}if(n.audio){if(n.fastStart.expectedAudioChunks===void 0)throw new TypeError("'fastStart' is an object but is missing property 'expectedAudioChunks'.");if(!Number.isInteger(n.fastStart.expectedAudioChunks)||n.fastStart.expectedAudioChunks<0)throw new TypeError("'expectedAudioChunks' must be a non-negative integer.")}}else if(![!1,"in-memory","fragmented"].includes(n.fastStart))throw new TypeError("'fastStart' option must be false, 'in-memory', 'fragmented' or an object.");if(n.minFragmentDuration!==void 0&&(!Number.isFinite(n.minFragmentDuration)||n.minFragmentDuration<0))throw new TypeError("'minFragmentDuration' must be a non-negative number.")};Qh=new WeakSet;bp=function(){if(N(this,Oe).writeBox(j0({holdsAvc:N(this,Re).video?.codec==="avc",fragmented:N(this,Re).fastStart==="fragmented"})),Xt(this,Ka,N(this,Oe).pos),N(this,Re).fastStart==="in-memory")Xt(this,Sn,qh(!1));else if(N(this,Re).fastStart!=="fragmented"){if(typeof N(this,Re).fastStart=="object"){let n=Qe(this,uu,xp).call(this);N(this,Oe).seek(N(this,Oe).pos+n)}Xt(this,Sn,qh(!0)),N(this,Oe).writeBox(N(this,Sn))}Qe(this,as,go).call(this)};uu=new WeakSet;xp=function(){if(typeof N(this,Re).fastStart!="object")return;let n=0,e=[N(this,Re).fastStart.expectedVideoChunks,N(this,Re).fastStart.expectedAudioChunks];for(let t of e)t&&(n+=8*Math.ceil(2/3*t),n+=4*t,n+=12*Math.ceil(2/3*t),n+=4*t,n+=8*t);return n+=4096,n};eu=new WeakSet;vp=function(){if(N(this,Re).video&&Xt(this,en,{id:1,info:{type:"video",codec:N(this,Re).video.codec,width:N(this,Re).video.width,height:N(this,Re).video.height,rotation:N(this,Re).video.rotation??0,decoderConfig:null},timescale:N(this,Re).video.frameRate??57600,samples:[],finalizedChunks:[],currentChunk:null,firstDecodeTimestamp:void 0,lastDecodeTimestamp:-1,timeToSampleTable:[],compositionTimeOffsetTable:[],lastTimescaleUnits:null,lastSample:null,compactlyCodedChunkTable:[]}),N(this,Re).audio&&(Xt(this,jt,{id:N(this,Re).video?2:1,info:{type:"audio",codec:N(this,Re).audio.codec,numberOfChannels:N(this,Re).audio.numberOfChannels,sampleRate:N(this,Re).audio.sampleRate,decoderConfig:null},timescale:N(this,Re).audio.sampleRate,samples:[],finalizedChunks:[],currentChunk:null,firstDecodeTimestamp:void 0,lastDecodeTimestamp:-1,timeToSampleTable:[],compositionTimeOffsetTable:[],lastTimescaleUnits:null,lastSample:null,compactlyCodedChunkTable:[]}),N(this,Re).audio.codec==="aac")){let n=Qe(this,du,_p).call(this,2,N(this,Re).audio.sampleRate,N(this,Re).audio.numberOfChannels);N(this,jt).info.decoderConfig={codec:N(this,Re).audio.codec,description:n,numberOfChannels:N(this,Re).audio.numberOfChannels,sampleRate:N(this,Re).audio.sampleRate}}};du=new WeakSet;_p=function(n,e,t){let r=[96e3,88200,64e3,48e3,44100,32e3,24e3,22050,16e3,12e3,11025,8e3,7350].indexOf(e),s=t,o="";o+=n.toString(2).padStart(5,"0"),o+=r.toString(2).padStart(4,"0"),r===15&&(o+=e.toString(2).padStart(24,"0")),o+=s.toString(2).padStart(4,"0");let a=Math.ceil(o.length/8)*8;o=o.padEnd(a,"0");let l=new Uint8Array(o.length/8);for(let c=0;c<o.length;c+=8)l[c/8]=parseInt(o.slice(c,c+8),2);return l};Xa=new WeakSet;tu=function(n,e,t,i,r,s,o){let a=i/1e6,l=(i-(o??0))/1e6,c=r/1e6,h=Qe(this,fu,Sp).call(this,a,l,n);return a=h.presentationTimestamp,l=h.decodeTimestamp,s?.decoderConfig&&(n.info.decoderConfig===null?n.info.decoderConfig=s.decoderConfig:Object.assign(n.info.decoderConfig,s.decoderConfig)),{presentationTimestamp:a,decodeTimestamp:l,duration:c,data:e,size:e.byteLength,type:t,timescaleUnitsToNextSample:di(c,n.timescale)}};hi=new WeakSet;wi=function(n,e){N(this,Re).fastStart!=="fragmented"&&n.samples.push(e);let t=di(e.presentationTimestamp-e.decodeTimestamp,n.timescale);if(n.lastTimescaleUnits!==null){let r=di(e.decodeTimestamp,n.timescale,!1),s=Math.round(r-n.lastTimescaleUnits);if(n.lastTimescaleUnits+=s,n.lastSample.timescaleUnitsToNextSample=s,N(this,Re).fastStart!=="fragmented"){let o=Ya(n.timeToSampleTable);o.sampleCount===1?(o.sampleDelta=s,o.sampleCount++):o.sampleDelta===s?o.sampleCount++:(o.sampleCount--,n.timeToSampleTable.push({sampleCount:2,sampleDelta:s}));let a=Ya(n.compositionTimeOffsetTable);a.sampleCompositionTimeOffset===t?a.sampleCount++:n.compositionTimeOffsetTable.push({sampleCount:1,sampleCompositionTimeOffset:t})}}else n.lastTimescaleUnits=0,N(this,Re).fastStart!=="fragmented"&&(n.timeToSampleTable.push({sampleCount:1,sampleDelta:di(e.duration,n.timescale)}),n.compositionTimeOffsetTable.push({sampleCount:1,sampleCompositionTimeOffset:t}));n.lastSample=e;let i=!1;if(!n.currentChunk)i=!0;else{let r=e.presentationTimestamp-n.currentChunk.startTimestamp;if(N(this,Re).fastStart==="fragmented"){let s=N(this,en)??N(this,jt),o=N(this,Re).minFragmentDuration??1;n===s&&e.type==="key"&&r>=o&&(i=!0,Qe(this,el,pu).call(this))}else i=r>=.5}i&&(n.currentChunk&&Qe(this,po,Qa).call(this,n),n.currentChunk={startTimestamp:e.presentationTimestamp,samples:[]}),n.currentChunk.samples.push(e)};fu=new WeakSet;Sp=function(n,e,t){let i=N(this,Re).firstTimestampBehavior==="strict",r=t.lastDecodeTimestamp===-1;if(i&&r&&e!==0)throw new Error(`The first chunk for your media track must have a timestamp of 0 (received DTS=${e}).Non-zero first timestamps are often caused by directly piping frames or audio data from a MediaStreamTrack into the encoder. Their timestamps are typically relative to the age of thedocument, which is probably what you want.

If you want to offset all timestamps of a track such that the first one is zero, set firstTimestampBehavior: 'offset' in the options.
`);if(N(this,Re).firstTimestampBehavior==="offset"||N(this,Re).firstTimestampBehavior==="cross-track-offset"){t.firstDecodeTimestamp===void 0&&(t.firstDecodeTimestamp=e);let o;N(this,Re).firstTimestampBehavior==="offset"?o=t.firstDecodeTimestamp:o=Math.min(N(this,en)?.firstDecodeTimestamp??1/0,N(this,jt)?.firstDecodeTimestamp??1/0),e-=o,n-=o}if(e<t.lastDecodeTimestamp)throw new Error(`Timestamps must be monotonically increasing (DTS went from ${t.lastDecodeTimestamp*1e6} to ${e*1e6}).`);return t.lastDecodeTimestamp=e,{presentationTimestamp:n,decodeTimestamp:e}};po=new WeakSet;Qa=function(n){if(N(this,Re).fastStart==="fragmented")throw new Error("Can't finalize individual chunks if 'fastStart' is set to 'fragmented'.");if(n.currentChunk){if(n.finalizedChunks.push(n.currentChunk),N(this,ss).push(n.currentChunk),(n.compactlyCodedChunkTable.length===0||Ya(n.compactlyCodedChunkTable).samplesPerChunk!==n.currentChunk.samples.length)&&n.compactlyCodedChunkTable.push({firstChunk:n.finalizedChunks.length,samplesPerChunk:n.currentChunk.samples.length}),N(this,Re).fastStart==="in-memory"){n.currentChunk.offset=0;return}n.currentChunk.offset=N(this,Oe).pos;for(let e of n.currentChunk.samples)N(this,Oe).write(e.data),e.data=null;Qe(this,as,go).call(this)}};el=new WeakSet;pu=function(n=!0){if(N(this,Re).fastStart!=="fragmented")throw new Error("Can't finalize a fragment unless 'fastStart' is set to 'fragmented'.");let e=[N(this,en),N(this,jt)].filter(a=>a&&a.currentChunk);if(e.length===0)return;let t=G0(this,hu)._++;if(t===1){let a=Wa(e,N(this,rs),!0);N(this,Oe).writeBox(a)}let i=N(this,Oe).pos,r=ap(t,e);N(this,Oe).writeBox(r);{let a=qh(!1),l=0;for(let h of e)for(let u of h.currentChunk.samples)l+=u.size;let c=N(this,Oe).measureBox(a)+l;c>=2**32&&(a.largeSize=!0,c=N(this,Oe).measureBox(a)+l),a.size=c,N(this,Oe).writeBox(a)}for(let a of e){a.currentChunk.offset=N(this,Oe).pos,a.currentChunk.moofOffset=i;for(let l of a.currentChunk.samples)N(this,Oe).write(l.data),l.data=null}let s=N(this,Oe).pos;N(this,Oe).seek(N(this,Oe).offsets.get(r));let o=ap(t,e);N(this,Oe).writeBox(o),N(this,Oe).seek(s);for(let a of e)a.finalizedChunks.push(a.currentChunk),N(this,ss).push(a.currentChunk),a.currentChunk=null;n&&Qe(this,as,go).call(this)};as=new WeakSet;go=function(){N(this,Oe)instanceof cu&&N(this,Oe).flush()};qa=new WeakSet;nu=function(){if(N(this,fo))throw new Error("Cannot add new video or audio chunks after the file has been finalized.")};function bu(n){return(n.revolution??0)-(n.shifted?1:0)}var mu=class{set;frame;revolutions;top;invariant;frames;stores=new Map;box=null;constructor(e,t,i,r=1){this.set=e,this.frame=t,this.frames=i,this.revolutions=e.periodic?r:1,this.top=this.revolutions-1,this.invariant=i.requirements(e.def.frame,t).channels.size===0}storeRevolution(e){return this.invariant?0:e}revolutionKey(e){return this.invariant?e<this.top?"joined":"top":String(e)}store(e){let t=this.storeRevolution(e),i=this.stores.get(t);return i===void 0&&(i={buf:new Float64Array(3*this.set.samples),done:new Uint8Array(this.set.trajectories),all:!1},this.stores.set(t,i)),i}ensure(e,t){let i=Yb(t),r=this.store(i);if(r.done[e]===1)return r.buf;let s=this.set,o=this.storeRevolution(i),a=s.start(e);for(let l=0;l<s.count(e);l++)r.buf.set(this.frames.transform(s.position(e,l),s.def.frame,this.frame,{set:s,trajectory:e,sample:l,shifted:!1,revolution:o}),3*(a+l));return r.done[e]=1,r.buf}revolutionPositions(e){let t=this.store(e);if(!t.all){for(let i=0;i<this.set.trajectories;i++)this.ensure(i,e);t.all=!0}return t.buf}get positions(){return this.revolutionPositions(0)}get shifted(){return this.set.periodic?this.revolutionPositions(-1):null}trajectory(e,t){let i=this.ensure(e,t),r=this.set.start(e);return i.subarray(3*r,3*(r+this.set.count(e)))}gpuSample(e,t,i,r,s=0){let o=i===this.set.count(e)-1&&t<this.top,a=this.ensure(e,o?t+1:t),l=3*(this.set.start(e)+(o?0:i));r[s]=a[l],r[s+1]=a[l+1],r[s+2]=a[l+2]}bounds(e){if(e===void 0&&this.box!==null)return this.box;let t=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let i=0;i<=(this.invariant?0:this.top);i++){let r=e===void 0?this.revolutionPositions(i):this.trajectory(e,i);for(let s=0;s<r.length;s+=3)for(let o=0;o<3;o++){let a=r[s+o];a<t[o]&&(t[o]=a),a>t[o+3]&&(t[o+3]=a)}}return e===void 0&&(this.box=t),t}vertex(e,t,i,r=0){let s=this.ensure(e,bu(t)),o=this.set.start(e);if("sample"in t){let c=3*(o+t.sample);i[r]=s[c],i[r+1]=s[c+1],i[r+2]=s[c+2];return}let a=3*(o+t.k),l=t.w;for(let c=0;c<3;c++)i[r+c]=(1-l)*s[a+c]+l*s[a+3+c]}},Yb=n=>n===!0?-1:n===!1?0:n,gu=class{channel;clocks;u;constructor(e,t){this.channel=t,this.clocks=[],this.u=new Float64Array(e.samples);for(let i=0;i<e.trajectories;i++){let r=new ci(e,i,t),s=e.start(i);for(let o=0;o<r.m;o++)this.u[s+o]=r.at(o);this.clocks.push(r)}}},nl=class{scene;sets;frames;geometries=new Map;readingsBy=new Map;bodyTrails=new Map;data;constructor(e,t){this.scene=e,this.data=t,this.sets=new ji(e,t),this.frames=new Gi(e)}bytes(e){this.data.has(e)||T("body",`the data container does not hold array ${JSON.stringify(e)}`);let t=this.data.array(e);return t.dtype!=="uint8"&&T("body",`array ${e} holds ${t.dtype}, not the uint8 bytes of an image`),t.data}geometry(e,t){let i=`${e}\0${t}`,r=this.geometries.get(i);return r||(r=new mu(this.sets.get(e),t,this.frames,Pt(this.scene.clock)),this.geometries.set(i,r)),r}hasChannel(e,t){return t===st||this.sets.get(e).hasChannel(t)}readings(e,t){let i=`${e}\0${t}`,r=this.readingsBy.get(i);return r||(r=new gu(this.sets.get(e),t),this.readingsBy.set(i,r)),r}bodyTrail(e,t,i,r){let s=`${e}\0${t}\0${i}\0${r}`,o=this.bodyTrails.get(s);return o||(o=new yu(this.frames,e,t,this.sets.get(i),r),this.bodyTrails.set(s,o)),o}};function Ep(n,e,t,i,r,s,o=!1){let a=Pt(r),l=on(a*qn(e.reading(r,s)),a),{k:c,w:h}=e.locate(l.u);return o?n.channelAt(i,t,h>=1?c+1:c,!1,l.revolution):(1-h)*n.channelAt(i,t,c,!1,l.revolution)+h*n.channelAt(i,t,c+1,!1,l.revolution)}var il=n=>n,wp=1<<20,yo=[wp,0,-wp,0],Jb=n=>[0,-1,n,2];function rl(n,e,t,i){let r=0,s=n.m;for(;r<s;){let o=r+s>>1,a=i(n.at(o));a>e||t&&a===e?s=o:r=o+1}return r}function Zb(n,e,t,i,r=il){if(e===t)return{range:[...yo],revolutions:null,pieces:[]};let s=i-1,o=on(e,i),a=on(t,i),l=It(n,o.u,!1,o.revolution),c=It(n,a.u,!1,a.revolution),h=o.revolution,u=r(o.u),f=a.revolution,d=r(a.u);d===0&&(f--,d=1);let p=[h,u,f,d],y=L=>r(n.at(L)),m=L=>L<s?n.m-2:n.m-1,g=(L,C)=>L<f||L===f&&C<d,b=(L,C)=>L>h||L===h&&u<C,_=rl(n,u,!1,r),x=_<=m(h)?[h,_]:h<s?[h+1,0]:null;x!==null&&!g(x[0],y(x[1]))&&(x=null);let M=Math.min(rl(n,d,!0,r)-1,m(f)),E=M>=0?[f,M]:null;if(E!==null&&!b(E[0],y(E[1]))&&(E=null),x===null||E===null||x[0]>E[0]||x[0]===E[0]&&x[1]>E[1])return{range:p,revolutions:null,pieces:[[l,c]]};let v=[[l,{sample:x[1],shifted:!1,revolution:x[0]}],[{sample:E[1],shifted:!1,revolution:E[0]},c]],A=x[0]===E[0]&&x[1]===E[1];return{range:p,revolutions:A?null:[x[0],E[1]===0?E[0]-1:E[0]],pieces:v}}function Tp(n,e){return(n.reveal??"none")!=="none"||$i(n)||e.mode==="epoch"&&(n.before==="hidden"||n.after==="hidden")}function Ap(n,e,t=1){return{reveal:n.reveal??"none",fraction:n.trail?.fraction??1,before:n.before,after:n.after,head:$i(n),periodic:e,revolutions:e?t:1}}function Rp(n,e,t,i,r=il){let s=i.revolutions,o={range:Jb(s-1),revolutions:[0,s-1],pieces:[]};if(n===null)return{hidden:!1,reading:null,loop:null,head:null,...o};let a=qn(n.reading(e,t),i.before,i.after);if(a===null)return{hidden:!0,reading:null,loop:null,head:null,range:[...yo],revolutions:null,pieces:[]};let l=s*a,c=on(l,s),h=i.head?It(n,c.u,!1,c.revolution):null;if(i.reveal==="none")return{hidden:!1,reading:a,loop:l,head:h,...o};let u=i.reveal==="grow"?0:l-s*i.fraction;return u<0&&!i.periodic&&(u=0),{hidden:!1,reading:a,loop:l,head:h,...Zb(n,u,l,s,r)}}function sl(n){return n.samples-n.trajectories}function Kb(n,e){return n.start(e)-e}function Cp(n,e){let t=0;for(let i=0;i<n.trajectories;i++){let r=n.start(i),s=n.count(i);for(let o=0;o+1<s;o++)e(t++,r+o)}}function xu(n,e,t){let i=new Float32Array(2*t*sl(n));return Cp(n,(r,s)=>{for(let o=0;o<t;o++)i[2*t*r+o]=e[t*s+o],i[2*t*r+t+o]=e[t*(s+1)+o]}),i}function vu(n,e,t,i){let r=new Float32Array(2*e*(i-1));for(let s=0;s+1<i;s++)for(let o=0;o<e;o++)r[2*e*s+o]=n[e*(t+s)+o],r[2*e*s+e+o]=n[e*(t+s+1)+o];return r}function Pp(n,e,t,i,r){let s=n.set.count(e),o=n.trajectory(e,t),a=[0,0,0];t<n.top&&n.gpuSample(e,t,s-1,a);for(let l=0;l+1<s;l++,r++)for(let c=0;c<3;c++)i[6*r+c]=o[3*l+c],i[6*r+3+c]=l+2===s&&t<n.top?a[c]:o[3*(l+1)+c]}function Ip(n,e){let t=new Float32Array(6*sl(n.set));for(let i=0;i<n.set.trajectories;i++)Pp(n,i,e,t,Kb(n.set,i));return t}function Lp(n,e,t){let i=new Float32Array(6*(n.set.count(e)-1));return Pp(n,e,t,i,0),i}function Dp(n,e){return("sample"in e?n.at(e.sample):(1-e.w)*n.at(e.k)+e.w*n.at(e.k+1))+bu(e)}function kp(n,e){let t=new Float32Array(4*sl(n));return Cp(n,(i,r)=>{t[4*i]=t[4*i+2]=e[r],t[4*i+1]=t[4*i+3]=e[r+1]}),t}function Np(n,e,t){let i=new Float32Array(4*(t-1));for(let r=0;r+1<t;r++)i[4*r]=i[4*r+2]=n[e+r],i[4*r+1]=i[4*r+3]=n[e+r+1];return i}function Op(n){let e=new Float32Array(2*sl(n)),t=0;for(let i=0;i<n.trajectories;i++)for(let r=0;r+1<n.count(i);r++,t++)e[2*t]=e[2*t+1]=i;return e}var yu=class{constructor(e,t,i,r,s){this.frames=e;this.body=t;this.display=i;this.set=r;this.trajectory=s;this.m=r.count(s),this.invariant=e.bodyRequirements(t,i).channels.size===0}frames;body;display;set;trajectory;m;invariant;revolutions=new Map;revolution(e){let t=this.invariant?0:e,i=this.revolutions.get(t);if(i===void 0){i=new Float64Array(3*this.m);let{set:r,trajectory:s}=this;for(let o=0;o<this.m;o++)i.set(this.frames.bodyPosition(this.body,this.display,{set:r,trajectory:s,sample:o,shifted:!1,revolution:t}),3*o);this.revolutions.set(t,i)}return i}vertex(e,t,i=0){let r=this.revolution(bu(e));if("sample"in e){let a=3*e.sample;t[i]=r[a],t[i+1]=r[a+1],t[i+2]=r[a+2];return}let s=3*e.k,o=e.w;for(let a=0;a<3;a++)t[i+a]=(1-o)*r[s+a]+o*r[s+3+a]}polyline(e,t,i,r,s){let o=0,a=u=>{this.vertex(u,s,3*o),o++},l=on(t,r);if(t===i)return a(It(e,l.u,!1,l.revolution)),o;let c=on(i,r),h=(u,f,d)=>{let p=rl(e,f,!1,il),y=rl(e,d,!0,il);y>p&&(s.set(this.revolution(u).subarray(3*p,3*y),3*o),o+=y-p)};if(l.revolution===c.revolution)return a(It(e,l.u,!1,l.revolution)),h(l.revolution,l.u,c.u),a(It(e,c.u,!1,c.revolution)),o;a(It(e,l.u,!1,l.revolution)),h(l.revolution,l.u,1);for(let u=l.revolution+1;u<c.revolution;u++)a(It(e,0,!1,u)),h(u,0,1);return a(It(e,0,!1,c.revolution)),c.u===0||(h(c.revolution,0,c.u),a(It(e,c.u,!1,c.revolution))),o}};function Fp(n,e,t){return(Math.ceil(e*t)+2)*(n+1)+2}var Up="\u2212";function Yi(n,e,t,i=!1){if(!Number.isFinite(n))return Number.isNaN(n)?"NaN":n>0?"\u221E":`${Up}\u221E`;n===0&&(n=0);let r;if(t!==void 0)r=n.toFixed(t),/^-0(\.0*)?$/.test(r)&&(r=r.slice(1));else if(e!==void 0)r=n.toPrecision(e);else if(Number.isInteger(n)&&Math.abs(n)<1e21)r=String(n);else{r=n.toPrecision(6);let[s,o]=r.split("e"),a=s.includes(".")?s.replace(/0+$/,"").replace(/\.$/,""):s;r=o===void 0?a:`${a}e${o}`}return i&&!r.includes("e")&&(r=r.replace(/^(-?)(\d+)/,(s,o,a)=>o+a.replace(/\B(?=(\d{3})+(?!\d))/g,","))),r.replace("e+","e").replace(/-/g,Up)}function qi(n,e){return Yi((e.factor??1)*n+(e.offset??0),e.digits,e.decimals,e.grouping??!1).padStart(e.width??0," ")}function al(n,e,t){let i=ht(n.scene,t.input);if(i?.kind!=="parameter"||i.parameter===void 0)return[];let r=[];for(let s of ro(n,t.domain)){let o=e.get(s);if(!o.hasParameter(i.parameter))continue;let a=o.parameter(i.parameter,"control");for(let l=0;l<a.length;l++)r.push(a[l])}return r.sort((s,o)=>s-o),r.filter((s,o)=>o===0||s!==r[o-1])}function bo(n,e){let t=-1;for(let i=0;i<n.length;i++)(t<0||Math.abs(n[i]-e)<Math.abs(n[t]-e))&&(t=i);return t}function ll(n,e,t,i,r,s){return n+Math.max(0,e)*i*r/(t*s)}function xo(n,e){return(Math.floor(n)%e+e)%e}function vo(n,e){let t=(n%e+e)%e/e;return t<1?t:0}function Bp(n,e){let{scene:t,geometry:i,state:r}=n,s=r.panels[n.panel];if(s===void 0||!Object.hasOwn(r.panels,n.panel))return[];let o={scene:t,state:r,panel:s},a=t.panels[s.panel],l=t.clock.frame_count,c=(n.frameIndex%l+l)%l,h=n.progress??c/l,u,f=()=>{if(u===void 0){let y=Et(o,a.reference.sets);u=y===null?null:{setId:y,trajectory:es(o,a.reference.member,i.sets.get(y))}}return u},d=[],p=Hn(t.clock,h);for(let y of e)if(typeof y=="string")d.push(y);else if("sub"in y)d.push(y.sub);else if("sup"in y)d.push(y.sup);else if("timed_text"in y){let m="";for(let[g,b]of y.timed_text)g<=p&&(m=String(b));d.push(m)}else if("keyframes"in y)d.push(qi(Jr(y.keyframes,p),y));else if("clock"in y)if(y.clock==="frame_index"||y.clock==="frame_count"){let m=y.clock==="frame_index"?c:l,g=y.factor!==void 0||y.offset!==void 0||y.decimals!==void 0||y.grouping;d.push(g?qi(m,y):String(m).padStart(y.width??0," "))}else y.clock==="time"?d.push(qi(p,y)):d.push(qi(t.clock.mode==="fraction"?h:wa(t.clock,h),y));else if("input"in y){let m=Wi(o,y.input),g=ht(t,y.input);typeof m=="number"?d.push(qi(m,y)):typeof m=="boolean"?d.push(m?"on":"off"):g?.kind==="choice"&&g.labels!==void 0?d.push(g.labels[g.values.indexOf(m)]??m):d.push(m)}else{let m=f();if(m===null){d.push("\u2014");continue}let g=i.sets.get(m.setId);if("parameter"in y)d.push(qi(g.parameter(y.parameter,"control")[m.trajectory],y));else if("attr"in y)d.push(qi(g.attr(y.attr),y));else if("channel"in y){let b=i.readings(m.setId,r.clock.channel).clocks[m.trajectory];g.hasChannel(y.channel)||T("control",`trajectory set ${m.setId} lacks channel ${JSON.stringify(y.channel)}`);let _=g.def.channels?.[y.channel]?.interp==="hold";d.push(qi(Ep(g,b,m.trajectory,y.channel,t.clock,h,_),y))}}return d}function zp(n){let e=[""],t=[];if(n.forEach((o,a)=>{typeof o=="string"?e[e.length-1]+=o:(t.push(a),e.push(""))}),t.length===0)return null;let i=o=>o.every(a=>a.trim()===""),r=[];for(let o=0;o<t.length;o++){let a=e[o].split(","),l=e[o+1].split(",");if((o>0?a.length<2||!i(a.slice(1,-1)):!i(a.slice(0,-1)))||o===t.length-1&&!i(l.slice(1)))return null;let c=a[a.length-1].replace(/\s*[=:]\s*$/,"").trim();if(c==="")return null;let h=n[t[o]],u="clock"in h||"keyframes"in h?5:"channel"in h?(h.digits??6)+5:null;r.push({label:c,part:t[o],unit:l[0].trim(),width:u})}let s=o=>"attr"in n[o.part];return[...r.filter(o=>!s(o)),...r.filter(s)]}var ol=class{times=[];reset(){this.times.length=0}note(e){this.times.push(e);let t=0;for(;t<this.times.length&&this.times[t]<e-1e3;)t++;t>0&&this.times.splice(0,t)}report(e){let t=this.times;if(t.length<2||e-t[0]<900||e-t[t.length-1]>1e3)return null;let i=[];for(let a=1;a<t.length;a++)i.push(t[a]-t[a-1]);let r=[...i].sort((a,l)=>a-l),s=r[Math.floor(r.length/10)],o=i.filter(a=>a>1.5*s).length;return{drawn:t.length,late:o,refresh:s}}};function _u(n){return n===null?"\u2013\u2013 fps":`${n.drawn} fps`}function Su(n){if(n===null)return"Frames drawn per second during playback";let e=Math.round(1e3/n.refresh);return`${n.drawn} frames drawn in the last second, ${n.late} late, on a display refreshing about ${e} times a second`}function Hp(n,e,t,i=""){let r=e?10:1;switch(n){case"x":case"y":case"z":case"X":case"Y":case"Z":return{kind:"view",axis:n.toLowerCase(),sign:e?-1:1};case".":return{kind:"turn",degrees:15};case",":return{kind:"turn",degrees:-15};case">":return{kind:"turn",degrees:90};case"<":return{kind:"turn",degrees:-90};case" ":case"k":case"K":return{kind:"toggle"};case"ArrowRight":return{kind:"step",by:r};case"ArrowLeft":return{kind:"step",by:-r};case"Home":return{kind:"seek",frame:0};case"f":case"F":return{kind:"fit"};case"ArrowUp":return{kind:"slider",by:r};case"ArrowDown":return{kind:"slider",by:-r}}return e&&i==="Period"?{kind:"turn",degrees:90}:e&&i==="Comma"?{kind:"turn",degrees:-90}:/^[0-9]$/.test(n)?{kind:"seek",frame:Math.round(t*Number(n)/10)%t}:null}function Vp(n,e,t){let i=t.startsWith("Arrow")||t==="Home"||t==="End"||t==="PageUp"||t==="PageDown";return n==="BUTTON"||n==="INPUT"&&e==="checkbox"?t===" "||t==="Enter":n==="INPUT"&&e==="range"?i:n==="SELECT"?i||t==="Enter"||t.length===1:n==="TEXTAREA"||n==="INPUT"}function Qb(n,e){let t=new Set([e]);for(let i of Object.values(n.trajectory_sets)){let r=i?.parameters;if(r===void 0||!Object.hasOwn(r,e))continue;let s=r[e],o=s.label??e;t.add(s.unit?`${o}, ${s.unit}`:o)}return t}function Gp(n,e,t){for(let i of e.layers){if(i.kind!=="trajectories"||i.color===void 0||typeof i.color=="string"||!("parameter"in i.color))continue;let r=i.color.parameter;if(Qb(n,r).has(t))for(let[s,o]of Object.entries(n.inputs??{})){if(o===void 0||o.kind!=="parameter"||o.scope==="per_panel"||o.parameter!==r)continue;let a=(n.controls??[]).find(l=>l.kind==="slider"&&l.input===s);return{input:s,label:a?.label??s,domain:a?.domain??i.sets}}}return null}function Wp(n,e,t,i){return bo(n,e+Math.min(1,Math.max(0,i))*(t-e))}var wu={frames:2e3,seconds:90},cl=[24,30,60],$p=[1,2,3,4];function hl(n,e,t,i=1,r=0,s=eo){let o=Math.round(t*s*e/i),a=l=>ll(r,l,e,n,i,s);return{count:o,duration:o/e,index:l=>xo(a(l),n),progress:l=>vo(a(l),n)}}function ul(n,e,t=wu){return n>=1?n>t.frames?`${n} frames is more than the ${t.frames} an export may have: lower the frame rate or the loops, or raise the speed`:n/e>t.seconds?`${(n/e).toFixed(1)} s is longer than the ${t.seconds} s an export may last: lower the loops or raise the speed`:null:`the frame count of the export is ${n}, not a count of at least one`}function jp(n,e,t=eo){for(let i of[...cl].reverse())if(ul(hl(n,i,1,e,0,t).count,i)===null)return i;return null}function _o(n,e={w:1280,h:720},t=1,i=30){if(n==="720p")return{width:1280,height:720,pixelRatio:1};if(n==="1080p")return{width:1920,height:1080,pixelRatio:1.5};let r=l=>Math.max(2,2*Math.floor(l/2)),s=r(e.w),o=r(e.h),a={width:s,height:o,pixelRatio:1};for(let l=8*Math.min(2,Math.max(1,Math.round(t)));l>=1;l--){let c=l/8;if(a={width:r(s*c),height:r(o*c),pixelRatio:c},qp(a.width,a.height,i))break}return a}var ex=[[30,1620,40500],[31,3600,108e3],[32,5120,216e3],[40,8192,245760],[42,8704,522240],[50,22080,589824],[51,36864,983040],[52,36864,2073600]],Xp=4096;function qp(n,e,t){return n%2===0&&e%2===0&&Math.max(n,e)<=Xp&&Yp(n,e,t)!==null}function Yp(n,e,t,i="high"){let r=Math.ceil(n/16),s=Math.ceil(e/16),o=r*s,a=ex.find(([,c,h])=>o<=c&&o*t<=h&&Math.max(r,s)<=Math.sqrt(8*c));return a===void 0?null:`avc1.${{high:"6400",main:"4d40",baseline:"42e0"}[i]}${a[0].toString(16).padStart(2,"0")}`}function tx(n,e,t){return Math.round(Math.min(4e7,Math.max(1e6,.08*n*e*t)))}var Mu=class{muxer;constructor(e,t,i){if(e%2!==0||t%2!==0)throw new Error(`an MP4 export needs even sides, not ${e} by ${t}`);this.muxer=new Mp({target:new ou,video:{codec:"avc",width:e,height:t,frameRate:i},fastStart:"in-memory"})}add(e,t,i,r,s){let o=s?.decoderConfig;if(o!==void 0){if(!o.codec.startsWith("avc1."))throw new Error(`an MP4 export holds H.264 only, not ${o.codec}`);if(o.description===void 0)throw new Error('the H.264 encoder did not give an avcC record. Configure it with avc: { format: "avc" }')}this.muxer.addVideoChunkRaw(e,t?"key":"delta",i,r,s)}finish(){return this.muxer.finalize(),new Uint8Array(this.muxer.target.buffer)}};function Eu(){return typeof VideoEncoder>"u"||typeof VideoFrame>"u"?"this browser does not have a WebCodecs video encoder":null}async function nx(n,e,t,i,r="no-preference"){if(!qp(n,e,t))throw new Error(`${n} by ${e} at ${t} fps is past H.264, which needs even sides, at most ${Xp} pixels a side, and a frame size and rate within level 5.2`);for(let s of["high","main","baseline"]){let a={codec:Yp(n,e,t,s),width:n,height:e,bitrate:i,framerate:t,hardwareAcceleration:r,avc:{format:"avc"}};if((await VideoEncoder.isConfigSupported(a)).supported===!0)return a}throw new Error(`this browser does not have an H.264 encoder for ${n} by ${e} at ${t} fps, and an MP4 that QuickTime opens needs H.264`)}async function Jp(n,e={}){let t=Eu();if(t!==null)throw new Error(t);let i=e.fps??30,r=typeof e.size=="object"?e.size:_o(e.size??"720p",n.panelArea,typeof window>"u"?1:window.devicePixelRatio,i),s=n.clock,o=hl(s.frame_count,i,e.loops??1,e.speed??1,e.start??0,Ct(s)),a=ul(o.count,i,e.limits);if(a!==null)throw new Error(a);let l=e.keyFrameInterval??2*i;if(!(l>=1))throw new Error(`the key-frame interval is ${l}, not a count of at least one frame`);let{width:c,height:h,pixelRatio:u}=r,f=e.signal,d=()=>new DOMException("the export was canceled","AbortError");if(f?.aborted)throw d();let p=await nx(c,h,i,e.bitrate??tx(c,h,i),e.hardwareAcceleration);e.onConfig?.(p);let y=new Mu(c,h,i),m=null,g=new VideoEncoder({output:(_,x)=>{let M=new Uint8Array(_.byteLength);_.copyTo(M);try{y.add(M,_.type==="key",_.timestamp,_.duration??Math.round(1e6/i),x)}catch(E){m??=E}},error:_=>m=_});g.configure(p);let b=null;try{b=await n.open(c/u,h/u,u);let _=document.createElement("canvas");_.width=c,_.height=h;let x=_.getContext("2d",{alpha:!1});for(let M=0;M<o.count;M++){if(f?.aborted)throw d();if(m!==null)throw m;x.setTransform(u,0,0,u,0,0),b.draw(x,o.index(M),o.progress(M)),e.onFrame?.(_,M);let E=new VideoFrame(_,{timestamp:Math.round(M*1e6/i),duration:Math.round(1e6/i)});for(g.encode(E,{keyFrame:M%l===0}),E.close(),e.onProgress?.(M+1,o.count);g.encodeQueueSize>4;)await new Promise(v=>setTimeout(v,1));await new Promise(v=>setTimeout(v,0))}if(await g.flush(),m!==null)throw m}finally{g.state!=="closed"&&g.close(),b?.close()}return new Blob([y.finish()],{type:"video/mp4"})}var Zp="http://www.w3.org/2000/svg",Kp=(n,e)=>`M${n-1} ${e}a1 1 0 1 0 2 0a1 1 0 1 0-2 0`,ix={house:{grid:24,fill:!1,d:["M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8","M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"]},chevronDown:{grid:24,fill:!1,d:["m6 9 6 6 6-6"]},grip:{grid:24,fill:!1,d:[[5,12,19].map(n=>Kp(9,n)).join(""),[5,12,19].map(n=>Kp(15,n)).join("")]},x:{grid:24,fill:!1,d:["M18 6 6 18","m6 6 12 12"]},rotateCcw:{grid:24,fill:!1,d:["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8","M3 3v5h5"]},turnLeft:{grid:24,fill:!1,d:["M3 7v6h6","M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"]},turnRight:{grid:24,fill:!1,d:["M21 7v6h-6","M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"]},plus:{grid:24,fill:!1,d:["M5 12h14","M12 5v14"]},download:{grid:24,fill:!1,d:["M12 15V3","M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4","m7 10 5 5 5-5"]},play:{grid:16,fill:!0,d:["M5 3.5v9l7.5-4.5z"]},pause:{grid:16,fill:!0,d:["M4.5 3H7v10H4.5zM9 3h2.5v10H9z"]}};function wn(n,e){let t=ix[n],i=document.createElementNS(Zp,"svg"),r={viewBox:`0 0 ${t.grid} ${t.grid}`,"aria-hidden":"true",focusable:"false",fill:t.fill?"currentColor":"none",stroke:t.fill?"none":"currentColor"};t.fill||Object.assign(r,{"stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round"});for(let[s,o]of Object.entries(r))i.setAttribute(s,o);i.setAttribute("class",e===void 0?`i i-${n}`:`i i-${n} ${e}`);for(let s of t.d){let o=document.createElementNS(Zp,"path");o.setAttribute("d",s),i.appendChild(o)}return i}function So(n){return n?n.kind==="panel"?[n.id]:[...So(n.a),...So(n.b)]:[]}function Mo(n,e,t,i){if(n.kind==="panel"){if(n.id!==e)return n;if(i==="centre")return{kind:"panel",id:t};let r={kind:"panel",id:t},s=i==="left"||i==="right"?"row":"col",o=i==="left"||i==="top";return{kind:"split",dir:s,ratio:.5,a:o?r:n,b:o?n:r}}return{...n,a:Mo(n.a,e,t,i),b:Mo(n.b,e,t,i)}}function wo(n,e){if(n.kind==="panel")return n.id===e?null:n;let t=wo(n.a,e),i=wo(n.b,e);return t?i?{...n,a:t,b:i}:t:i}function dl(n,e=1){return n.kind==="panel"?[{id:n.id,area:e}]:[...dl(n.a,e*n.ratio),...dl(n.b,e*(1-n.ratio))]}function Qp(n,e,t,i){let r=n/Math.max(1,t),s=e/Math.max(1,i),o=.28,a=[{zone:"left",v:r},{zone:"right",v:1-r},{zone:"top",v:s},{zone:"bottom",v:1-s}].sort((l,c)=>l.v-c.v)[0];return a.v<o?a.zone:"centre"}var jn={LEFT:0,MIDDLE:1,RIGHT:2,ROTATE:0,DOLLY:1,PAN:2},ti={ROTATE:0,PAN:1,DOLLY_PAN:2,DOLLY_ROTATE:3},Pm=0,Qu=1,Im=2;var Yo=1,Lm=2,Fs=3,cr=0,gn=1,Dn=2,Ni=0,Us=1,ed=2,td=3,nd=4,Dm=5;var Vr=100,km=101,Nm=102,Om=103,Fm=104,Um=200,Bm=201,zm=202,Hm=203,id=204,rd=205,Vm=206,Gm=207,Wm=208,$m=209,jm=210,Xm=211,qm=212,Ym=213,Jm=214,Ul=0,Bl=1,zl=2,Ss=3,Hl=4,Vl=5,Gl=6,Wl=7,sd=0,Zm=1,Km=2,gi=0,od=1,ad=2,ld=3,cd=4,hd=5,ud=6,dd=7;var fd=300,Gr=301,Bs=302,mc=303,gc=304,$l=1e3,mi=1001,jl=1002,xt=1003,Qm=1004;var Jo=1005;var pn=1006,yc=1007;var Oi=1008;var kn=1009,pd=1010,md=1011,zs=1012,bc=1013,ni=1014,Nn=1015,ii=1016,xc=1017,vc=1018,Wr=1020,gd=35902,yd=35899,bd=1021,xd=1022,On=1023,Li=1026,Fi=1027,vd=1028,_c=1029,hr=1030,Sc=1031;var Mc=1033,Zo=33776,Ko=33777,Qo=33778,ea=33779,wc=35840,Ec=35841,Tc=35842,Ac=35843,Rc=36196,Cc=37492,Pc=37496,Ic=37488,Lc=37489,ta=37490,Dc=37491,kc=37808,Nc=37809,Oc=37810,Fc=37811,Uc=37812,Bc=37813,zc=37814,Hc=37815,Vc=37816,Gc=37817,Wc=37818,$c=37819,jc=37820,Xc=37821,qc=36492,Yc=36494,Jc=36495,Zc=36283,Kc=36284,na=36285,Qc=36286;var Do=2300,Xl=2301,Fl=2302,ju=2303,Xu=2400,qu=2401,Yu=2402;var eg=3200;var _d=0,tg=1,ri="",An="srgb",Or="srgb-linear",ko="linear",ot="srgb";var Nr=7680,Sd=7681;var Md=517;var ng=519,ig=512,rg=513,sg=514,wd=515,og=516,ag=517,Ed=518,Td=519,Ad=35044,yi=35048;var ia="300 es",$n=2e3,No=2001;function rx(n){for(let e=n.length-1;e>=0;--e)if(n[e]>=65535)return!0;return!1}function sx(n){return ArrayBuffer.isView(n)&&!(n instanceof DataView)}function Oo(n){return document.createElementNS("http://www.w3.org/1999/xhtml",n)}function lg(){let n=Oo("canvas");return n.style.display="block",n}var em={},Ms=null;function Fo(...n){let e="THREE."+n.shift();Ms?Ms("log",e,...n):console.log(e,...n)}function cg(n){let e=n[0];if(typeof e=="string"&&e.startsWith("TSL:")){let t=n[1];t&&t.isStackTrace?n[0]+=" "+t.getLocation():n[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return n}function Ie(...n){n=cg(n);let e="THREE."+n.shift();if(Ms)Ms("warn",e,...n);else{let t=n[0];t&&t.isStackTrace?console.warn(t.getError(e)):console.warn(e,...n)}}function Fe(...n){n=cg(n);let e="THREE."+n.shift();if(Ms)Ms("error",e,...n);else{let t=n[0];t&&t.isStackTrace?console.error(t.getError(e)):console.error(e,...n)}}function Po(...n){let e=n.join(" ");e in em||(em[e]=!0,Ie(...n))}function hg(n,e,t){return new Promise(function(i,r){function s(){switch(n.clientWaitSync(e,n.SYNC_FLUSH_COMMANDS_BIT,0)){case n.WAIT_FAILED:r();break;case n.TIMEOUT_EXPIRED:setTimeout(s,t);break;default:i()}}setTimeout(s,t)})}var ug={[Ul]:Ul,[zl]:Gl,[Hl]:Hl,[Ss]:Vl,[Bl]:Bl,[Gl]:zl,[Wl]:Wl,[Vl]:Ss},Qn=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let i=this._listeners;i[e]===void 0&&(i[e]=[]),i[e].indexOf(t)===-1&&i[e].push(t)}hasEventListener(e,t){let i=this._listeners;return i===void 0?!1:i[e]!==void 0&&i[e].indexOf(t)!==-1}removeEventListener(e,t){let i=this._listeners;if(i===void 0)return;let r=i[e];if(r!==void 0){let s=r.indexOf(t);s!==-1&&r.splice(s,1)}}dispatchEvent(e){let t=this._listeners;if(t===void 0)return;let i=t[e.type];if(i!==void 0){e.target=this;let r=i.slice(0);for(let s=0,o=r.length;s<o;s++)r[s].call(this,e);e.target=null}}},an=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],tm=1234567,Io=Math.PI/180,ws=180/Math.PI;function ur(){let n=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,i=Math.random()*4294967295|0;return(an[n&255]+an[n>>8&255]+an[n>>16&255]+an[n>>24&255]+"-"+an[e&255]+an[e>>8&255]+"-"+an[e>>16&15|64]+an[e>>24&255]+"-"+an[t&63|128]+an[t>>8&255]+"-"+an[t>>16&255]+an[t>>24&255]+an[i&255]+an[i>>8&255]+an[i>>16&255]+an[i>>24&255]).toLowerCase()}function Ye(n,e,t){return Math.max(e,Math.min(t,n))}function Rd(n,e){return(n%e+e)%e}function ox(n,e,t,i,r){return i+(n-e)*(r-i)/(t-e)}function ax(n,e,t){return n!==e?(t-n)/(e-n):0}function Lo(n,e,t){return(1-t)*n+t*e}function lx(n,e,t,i){return Lo(n,e,1-Math.exp(-t*i))}function cx(n,e=1){return e-Math.abs(Rd(n,e*2)-e)}function hx(n,e,t){return n<=e?0:n>=t?1:(n=(n-e)/(t-e),n*n*(3-2*n))}function ux(n,e,t){return n<=e?0:n>=t?1:(n=(n-e)/(t-e),n*n*n*(n*(n*6-15)+10))}function dx(n,e){return n+Math.floor(Math.random()*(e-n+1))}function fx(n,e){return n+Math.random()*(e-n)}function px(n){return n*(.5-Math.random())}function mx(n){n!==void 0&&(tm=n);let e=tm+=1831565813;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}function gx(n){return n*Io}function yx(n){return n*ws}function bx(n){return n>0&&Number.isInteger(n)&&2**Math.round(Math.log2(n))===n}function xx(n){return Math.pow(2,Math.ceil(Math.log(n)/Math.LN2))}function Cd(n){return Math.pow(2,Math.floor(Math.log(n)/Math.LN2))}function vx(n,e,t,i,r){let s=Math.cos,o=Math.sin,a=s(t/2),l=o(t/2),c=s((e+i)/2),h=o((e+i)/2),u=s((e-i)/2),f=o((e-i)/2),d=s((i-e)/2),p=o((i-e)/2);switch(r){case"XYX":n.set(a*h,l*u,l*f,a*c);break;case"YZY":n.set(l*f,a*h,l*u,a*c);break;case"ZXZ":n.set(l*u,l*f,a*h,a*c);break;case"XZX":n.set(a*h,l*p,l*d,a*c);break;case"YXY":n.set(l*d,a*h,l*p,a*c);break;case"ZYZ":n.set(l*p,l*d,a*h,a*c);break;default:Ie("MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+r)}}function eh(n){switch(n.constructor){case Uint32Array:return 4294967295;case Uint16Array:return 65535;case Uint8Array:case Uint8ClampedArray:return 255;case Int32Array:return 2147483647;case Int16Array:return 32767;case Int8Array:return 127;default:return}}function Pd(n,e){if(e.constructor===Float32Array)return n;let t=eh(e);if(t===void 0)throw new Error("THREE.MathUtils: Invalid component type.");return Math.max(n/t,-1)}function Id(n,e){if(e.constructor===Float32Array)return n;let t=eh(e);if(t===void 0)throw new Error("THREE.MathUtils: Invalid component type.");return Math.round(n*t)}var Ld={DEG2RAD:Io,RAD2DEG:ws,generateUUID:ur,clamp:Ye,euclideanModulo:Rd,mapLinear:ox,inverseLerp:ax,lerp:Lo,damp:lx,pingpong:cx,smoothstep:hx,smootherstep:ux,randInt:dx,randFloat:fx,randFloatSpread:px,seededRandom:mx,degToRad:gx,radToDeg:yx,isPowerOfTwo:bx,ceilPowerOfTwo:xx,floorPowerOfTwo:Cd,setQuaternionFromProperEuler:vx,normalize:Id,denormalize:Pd},Pe=class{static{this.prototype.isVector2=!0}constructor(e=0,t=0){this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("THREE.Vector2: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,i=this.y,r=e.elements;return this.x=r[0]*t+r[3]*i+r[6],this.y=r[1]*t+r[4]*i+r[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=Ye(this.x,e.x,t.x),this.y=Ye(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=Ye(this.x,e,t),this.y=Ye(this.y,e,t),this}clampLength(e,t){let i=this.length();return this.divideScalar(i||1).multiplyScalar(Ye(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let i=this.dot(e)/t;return Math.acos(Ye(i,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,i=this.y-e.y;return t*t+i*i}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let i=Math.cos(t),r=Math.sin(t),s=this.x-e.x,o=this.y-e.y;return this.x=s*i-o*r+e.x,this.y=s*r+o*i+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},Cn=class{constructor(e=0,t=0,i=0,r=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=i,this._w=r}static slerpFlat(e,t,i,r,s,o,a){let l=i[r+0],c=i[r+1],h=i[r+2],u=i[r+3],f=s[o+0],d=s[o+1],p=s[o+2],y=s[o+3];if(u!==y||l!==f||c!==d||h!==p){let m=l*f+c*d+h*p+u*y;m<0&&(f=-f,d=-d,p=-p,y=-y,m=-m);let g=1-a;if(m<.9995){let b=Math.acos(m),_=Math.sin(b);g=Math.sin(g*b)/_,a=Math.sin(a*b)/_,l=l*g+f*a,c=c*g+d*a,h=h*g+p*a,u=u*g+y*a}else{l=l*g+f*a,c=c*g+d*a,h=h*g+p*a,u=u*g+y*a;let b=1/Math.sqrt(l*l+c*c+h*h+u*u);l*=b,c*=b,h*=b,u*=b}}e[t]=l,e[t+1]=c,e[t+2]=h,e[t+3]=u}static multiplyQuaternionsFlat(e,t,i,r,s,o){let a=i[r],l=i[r+1],c=i[r+2],h=i[r+3],u=s[o],f=s[o+1],d=s[o+2],p=s[o+3];return e[t]=a*p+h*u+l*d-c*f,e[t+1]=l*p+h*f+c*u-a*d,e[t+2]=c*p+h*d+a*f-l*u,e[t+3]=h*p-a*u-l*f-c*d,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,i,r){return this._x=e,this._y=t,this._z=i,this._w=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let i=e._x,r=e._y,s=e._z,o=e._order,a=Math.cos,l=Math.sin,c=a(i/2),h=a(r/2),u=a(s/2),f=l(i/2),d=l(r/2),p=l(s/2);switch(o){case"XYZ":this._x=f*h*u+c*d*p,this._y=c*d*u-f*h*p,this._z=c*h*p+f*d*u,this._w=c*h*u-f*d*p;break;case"YXZ":this._x=f*h*u+c*d*p,this._y=c*d*u-f*h*p,this._z=c*h*p-f*d*u,this._w=c*h*u+f*d*p;break;case"ZXY":this._x=f*h*u-c*d*p,this._y=c*d*u+f*h*p,this._z=c*h*p+f*d*u,this._w=c*h*u-f*d*p;break;case"ZYX":this._x=f*h*u-c*d*p,this._y=c*d*u+f*h*p,this._z=c*h*p-f*d*u,this._w=c*h*u+f*d*p;break;case"YZX":this._x=f*h*u+c*d*p,this._y=c*d*u+f*h*p,this._z=c*h*p-f*d*u,this._w=c*h*u-f*d*p;break;case"XZY":this._x=f*h*u-c*d*p,this._y=c*d*u-f*h*p,this._z=c*h*p+f*d*u,this._w=c*h*u+f*d*p;break;default:Ie("Quaternion: .setFromEuler() encountered an unknown order: "+o)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let i=t/2,r=Math.sin(i);return this._x=e.x*r,this._y=e.y*r,this._z=e.z*r,this._w=Math.cos(i),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,i=t[0],r=t[4],s=t[8],o=t[1],a=t[5],l=t[9],c=t[2],h=t[6],u=t[10],f=i+a+u;if(f>0){let d=.5/Math.sqrt(f+1);this._w=.25/d,this._x=(h-l)*d,this._y=(s-c)*d,this._z=(o-r)*d}else if(i>a&&i>u){let d=2*Math.sqrt(1+i-a-u);this._w=(h-l)/d,this._x=.25*d,this._y=(r+o)/d,this._z=(s+c)/d}else if(a>u){let d=2*Math.sqrt(1+a-i-u);this._w=(s-c)/d,this._x=(r+o)/d,this._y=.25*d,this._z=(l+h)/d}else{let d=2*Math.sqrt(1+u-i-a);this._w=(o-r)/d,this._x=(s+c)/d,this._y=(l+h)/d,this._z=.25*d}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let i=e.dot(t)+1;return i<1e-8?(i=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=i):(this._x=0,this._y=-e.z,this._z=e.y,this._w=i)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=i),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(Ye(this.dot(e),-1,1)))}rotateTowards(e,t){let i=this.angleTo(e);if(i===0)return this;let r=Math.min(1,t/i);return this.slerp(e,r),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let i=e._x,r=e._y,s=e._z,o=e._w,a=t._x,l=t._y,c=t._z,h=t._w;return this._x=i*h+o*a+r*c-s*l,this._y=r*h+o*l+s*a-i*c,this._z=s*h+o*c+i*l-r*a,this._w=o*h-i*a-r*l-s*c,this._onChangeCallback(),this}slerp(e,t){let i=e._x,r=e._y,s=e._z,o=e._w,a=this.dot(e);a<0&&(i=-i,r=-r,s=-s,o=-o,a=-a);let l=1-t;if(a<.9995){let c=Math.acos(a),h=Math.sin(c);l=Math.sin(l*c)/h,t=Math.sin(t*c)/h,this._x=this._x*l+i*t,this._y=this._y*l+r*t,this._z=this._z*l+s*t,this._w=this._w*l+o*t,this._onChangeCallback()}else this._x=this._x*l+i*t,this._y=this._y*l+r*t,this._z=this._z*l+s*t,this._w=this._w*l+o*t,this.normalize();return this}slerpQuaternions(e,t,i){return this.copy(e).slerp(t,i)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),i=Math.random(),r=Math.sqrt(1-i),s=Math.sqrt(i);return this.set(r*Math.sin(e),r*Math.cos(e),s*Math.sin(t),s*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},O=class{static{this.prototype.isVector3=!0}constructor(e=0,t=0,i=0){this.x=e,this.y=t,this.z=i}set(e,t,i){return i===void 0&&(i=this.z),this.x=e,this.y=t,this.z=i,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("THREE.Vector3: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(nm.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(nm.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,i=this.y,r=this.z,s=e.elements;return this.x=s[0]*t+s[3]*i+s[6]*r,this.y=s[1]*t+s[4]*i+s[7]*r,this.z=s[2]*t+s[5]*i+s[8]*r,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,i=this.y,r=this.z,s=e.elements,o=1/(s[3]*t+s[7]*i+s[11]*r+s[15]);return this.x=(s[0]*t+s[4]*i+s[8]*r+s[12])*o,this.y=(s[1]*t+s[5]*i+s[9]*r+s[13])*o,this.z=(s[2]*t+s[6]*i+s[10]*r+s[14])*o,this}applyQuaternion(e){let t=this.x,i=this.y,r=this.z,s=e.x,o=e.y,a=e.z,l=e.w,c=2*(o*r-a*i),h=2*(a*t-s*r),u=2*(s*i-o*t);return this.x=t+l*c+o*u-a*h,this.y=i+l*h+a*c-s*u,this.z=r+l*u+s*h-o*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,i=this.y,r=this.z,s=e.elements;return this.x=s[0]*t+s[4]*i+s[8]*r,this.y=s[1]*t+s[5]*i+s[9]*r,this.z=s[2]*t+s[6]*i+s[10]*r,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=Ye(this.x,e.x,t.x),this.y=Ye(this.y,e.y,t.y),this.z=Ye(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=Ye(this.x,e,t),this.y=Ye(this.y,e,t),this.z=Ye(this.z,e,t),this}clampLength(e,t){let i=this.length();return this.divideScalar(i||1).multiplyScalar(Ye(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this.z=e.z+(t.z-e.z)*i,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let i=e.x,r=e.y,s=e.z,o=t.x,a=t.y,l=t.z;return this.x=r*l-s*a,this.y=s*o-i*l,this.z=i*a-r*o,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let i=e.dot(this)/t;return this.copy(e).multiplyScalar(i)}projectOnPlane(e){return Tu.copy(this).projectOnVector(e),this.sub(Tu)}reflect(e){return this.sub(Tu.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let i=this.dot(e)/t;return Math.acos(Ye(i,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,i=this.y-e.y,r=this.z-e.z;return t*t+i*i+r*r}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,i){let r=Math.sin(t)*e;return this.x=r*Math.sin(i),this.y=Math.cos(t)*e,this.z=r*Math.cos(i),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,i){return this.x=e*Math.sin(t),this.y=i,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),i=this.setFromMatrixColumn(e,1).length(),r=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=i,this.z=r,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=Math.random()*2-1,i=Math.sqrt(1-t*t);return this.x=i*Math.cos(e),this.y=t,this.z=i*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},Tu=new O,nm=new Cn,Ue=class{static{this.prototype.isMatrix3=!0}constructor(e,t,i,r,s,o,a,l,c){this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,i,r,s,o,a,l,c)}set(e,t,i,r,s,o,a,l,c){let h=this.elements;return h[0]=e,h[1]=r,h[2]=a,h[3]=t,h[4]=s,h[5]=l,h[6]=i,h[7]=o,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,i=e.elements;return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=i[3],t[4]=i[4],t[5]=i[5],t[6]=i[6],t[7]=i[7],t[8]=i[8],this}extractBasis(e,t,i){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),i.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let i=e.elements,r=t.elements,s=this.elements,o=i[0],a=i[3],l=i[6],c=i[1],h=i[4],u=i[7],f=i[2],d=i[5],p=i[8],y=r[0],m=r[3],g=r[6],b=r[1],_=r[4],x=r[7],M=r[2],E=r[5],v=r[8];return s[0]=o*y+a*b+l*M,s[3]=o*m+a*_+l*E,s[6]=o*g+a*x+l*v,s[1]=c*y+h*b+u*M,s[4]=c*m+h*_+u*E,s[7]=c*g+h*x+u*v,s[2]=f*y+d*b+p*M,s[5]=f*m+d*_+p*E,s[8]=f*g+d*x+p*v,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],i=e[1],r=e[2],s=e[3],o=e[4],a=e[5],l=e[6],c=e[7],h=e[8];return t*o*h-t*a*c-i*s*h+i*a*l+r*s*c-r*o*l}invert(){let e=this.elements,t=e[0],i=e[1],r=e[2],s=e[3],o=e[4],a=e[5],l=e[6],c=e[7],h=e[8],u=h*o-a*c,f=a*l-h*s,d=c*s-o*l,p=t*u+i*f+r*d;if(p===0)return this.set(0,0,0,0,0,0,0,0,0);let y=1/p;return e[0]=u*y,e[1]=(r*c-h*i)*y,e[2]=(a*i-r*o)*y,e[3]=f*y,e[4]=(h*t-r*l)*y,e[5]=(r*s-a*t)*y,e[6]=d*y,e[7]=(i*l-c*t)*y,e[8]=(o*t-i*s)*y,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,i,r,s,o,a){let l=Math.cos(s),c=Math.sin(s);return this.set(i*l,i*c,-i*(l*o+c*a)+o+e,-r*c,r*l,-r*(-c*o+l*a)+a+t,0,0,1),this}scale(e,t){return Po("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(Au.makeScale(e,t)),this}rotate(e){return Po("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(Au.makeRotation(-e)),this}translate(e,t){return Po("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(Au.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),i=Math.sin(e);return this.set(t,-i,0,i,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,i=e.elements;for(let r=0;r<9;r++)if(t[r]!==i[r])return!1;return!0}fromArray(e,t=0){for(let i=0;i<9;i++)this.elements[i]=e[i+t];return this}toArray(e=[],t=0){let i=this.elements;return e[t]=i[0],e[t+1]=i[1],e[t+2]=i[2],e[t+3]=i[3],e[t+4]=i[4],e[t+5]=i[5],e[t+6]=i[6],e[t+7]=i[7],e[t+8]=i[8],e}clone(){return new this.constructor().fromArray(this.elements)}},Au=new Ue,im=new Ue().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),rm=new Ue().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function _x(){let n={enabled:!0,workingColorSpace:Or,spaces:{},convert:function(r,s,o){return this.enabled===!1||s===o||!s||!o||(this.spaces[s].transfer===ot&&(r.r=Ii(r.r),r.g=Ii(r.g),r.b=Ii(r.b)),this.spaces[s].primaries!==this.spaces[o].primaries&&(r.applyMatrix3(this.spaces[s].toXYZ),r.applyMatrix3(this.spaces[o].fromXYZ)),this.spaces[o].transfer===ot&&(r.r=_s(r.r),r.g=_s(r.g),r.b=_s(r.b))),r},workingToColorSpace:function(r,s){return this.convert(r,this.workingColorSpace,s)},colorSpaceToWorking:function(r,s){return this.convert(r,s,this.workingColorSpace)},getPrimaries:function(r){return this.spaces[r].primaries},getTransfer:function(r){return r===ri?ko:this.spaces[r].transfer},getToneMappingMode:function(r){return this.spaces[r].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(r,s=this.workingColorSpace){return r.fromArray(this.spaces[s].luminanceCoefficients)},define:function(r){Object.assign(this.spaces,r)},_getMatrix:function(r,s,o){return r.copy(this.spaces[o].fromXYZ).multiply(this.spaces[s].toXYZ)},_getDrawingBufferColorSpace:function(r){return this.spaces[r].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(r=this.workingColorSpace){return this.spaces[r].workingColorSpaceConfig.unpackColorSpace}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],i=[.3127,.329];return n.define({[Or]:{primaries:e,whitePoint:i,transfer:ko,toXYZ:im,fromXYZ:rm,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:An},outputColorSpaceConfig:{drawingBufferColorSpace:An}},[An]:{primaries:e,whitePoint:i,transfer:ot,toXYZ:im,fromXYZ:rm,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:An}}}),n}var qe=_x();function Ii(n){return n<.04045?n*.0773993808:Math.pow(n*.9478672986+.0521327014,2.4)}function _s(n){return n<.0031308?n*12.92:1.055*Math.pow(n,.41666)-.055}var ls,ql=class{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let i;if(e instanceof HTMLCanvasElement)i=e;else{ls===void 0&&(ls=Oo("canvas")),ls.width=e.width,ls.height=e.height;let r=ls.getContext("2d");e instanceof ImageData?r.putImageData(e,0,0):r.drawImage(e,0,0,e.width,e.height),i=ls}return i.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){let t=Oo("canvas");t.width=e.width,t.height=e.height;let i=t.getContext("2d");i.drawImage(e,0,0,e.width,e.height);let r=i.getImageData(0,0,e.width,e.height),s=r.data;for(let o=0;o<s.length;o++)s[o]=Ii(s[o]/255)*255;return i.putImageData(r,0,0),t}else if(e.data){let t=e.data.slice(0);for(let i=0;i<t.length;i++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[i]=Math.floor(Ii(t[i]/255)*255):t[i]=Ii(t[i]);return{data:t,width:e.width,height:e.height}}else return Ie("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}},Sx=0,Es=class{constructor(e=null){this.isTextureSource=!0,Object.defineProperty(this,"id",{value:Sx++}),this.uuid=ur(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){let t=this.data;return typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<"u"&&t instanceof VideoFrame?e.set(t.displayWidth,t.displayHeight,0):t!==null?e.set(t.width||0,t.height||0,t.depth||0):e.set(0,0,0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let i={uuid:this.uuid,url:""},r=this.data;if(r!==null){let s;if(Array.isArray(r)){s=[];for(let o=0,a=r.length;o<a;o++)r[o].isDataTexture?s.push(Ru(r[o].image)):s.push(Ru(r[o]))}else s=Ru(r);i.url=s}return t||(e.images[this.uuid]=i),i}};function Ru(n){return typeof HTMLImageElement<"u"&&n instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&n instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&n instanceof ImageBitmap?ql.getDataURL(n):n.data?{data:Array.from(n.data),width:n.width,height:n.height,type:n.data.constructor.name}:(Ie("Texture: Unable to serialize Texture."),{})}var Mx=0,Cu=new O,tn=class n extends Qn{constructor(e=n.DEFAULT_IMAGE,t=n.DEFAULT_MAPPING,i=mi,r=mi,s=pn,o=Oi,a=On,l=kn,c=n.DEFAULT_ANISOTROPY,h=ri){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Mx++}),this.uuid=ur(),this.name="",this.source=new Es(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=i,this.wrapT=r,this.magFilter=s,this.minFilter=o,this.anisotropy=c,this.format=a,this.internalFormat=null,this.type=l,this.offset=new Pe(0,0),this.repeat=new Pe(1,1),this.center=new Pe(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Ue,this.generateMipmaps=!0,this.mipmapsAutoUpdate=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0,this.isPMREMTexture=!1,this.normalized=!1}get width(){return this.source.getSize(Cu).x}get height(){return this.source.getSize(Cu).y}get depth(){return this.source.getSize(Cu).z}get image(){return this.source.data}set image(e){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.normalized=e.normalized,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.mipmapsAutoUpdate=e.mipmapsAutoUpdate,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isPMREMTexture=e.isPMREMTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(let t in e){let i=e[t];if(i===void 0){Ie(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}let r=this[t];if(r===void 0){Ie(`Texture.setValues(): property '${t}' does not exist.`);continue}r&&i&&r.isVector2&&i.isVector2||r&&i&&r.isVector3&&i.isVector3||r&&i&&r.isMatrix3&&i.isMatrix3?r.copy(i):this[t]=i}}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let i={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,mipmapsAutoUpdate:this.mipmapsAutoUpdate,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(i.userData=this.userData),t||(e.textures[this.uuid]=i),i}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==fd)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case $l:e.x=e.x-Math.floor(e.x);break;case mi:e.x=e.x<0?0:1;break;case jl:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case $l:e.y=e.y-Math.floor(e.y);break;case mi:e.y=e.y<0?0:1;break;case jl:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}};tn.DEFAULT_IMAGE=null;tn.DEFAULT_MAPPING=fd;tn.DEFAULT_ANISOTROPY=1;var at=class{static{this.prototype.isVector4=!0}constructor(e=0,t=0,i=0,r=1){this.x=e,this.y=t,this.z=i,this.w=r}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,i,r){return this.x=e,this.y=t,this.z=i,this.w=r,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("THREE.Vector4: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,i=this.y,r=this.z,s=this.w,o=e.elements;return this.x=o[0]*t+o[4]*i+o[8]*r+o[12]*s,this.y=o[1]*t+o[5]*i+o[9]*r+o[13]*s,this.z=o[2]*t+o[6]*i+o[10]*r+o[14]*s,this.w=o[3]*t+o[7]*i+o[11]*r+o[15]*s,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,i,r,s,l=e.elements,c=l[0],h=l[4],u=l[8],f=l[1],d=l[5],p=l[9],y=l[2],m=l[6],g=l[10];if(Math.abs(h-f)<.01&&Math.abs(u-y)<.01&&Math.abs(p-m)<.01){if(Math.abs(h+f)<.1&&Math.abs(u+y)<.1&&Math.abs(p+m)<.1&&Math.abs(c+d+g-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;let _=(c+1)/2,x=(d+1)/2,M=(g+1)/2,E=(h+f)/4,v=(u+y)/4,A=(p+m)/4;return _>x&&_>M?_<.01?(i=0,r=.707106781,s=.707106781):(i=Math.sqrt(_),r=E/i,s=v/i):x>M?x<.01?(i=.707106781,r=0,s=.707106781):(r=Math.sqrt(x),i=E/r,s=A/r):M<.01?(i=.707106781,r=.707106781,s=0):(s=Math.sqrt(M),i=v/s,r=A/s),this.set(i,r,s,t),this}let b=Math.sqrt((m-p)*(m-p)+(u-y)*(u-y)+(f-h)*(f-h));return Math.abs(b)<.001&&(b=1),this.x=(m-p)/b,this.y=(u-y)/b,this.z=(f-h)/b,this.w=Math.acos((c+d+g-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=Ye(this.x,e.x,t.x),this.y=Ye(this.y,e.y,t.y),this.z=Ye(this.z,e.z,t.z),this.w=Ye(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=Ye(this.x,e,t),this.y=Ye(this.y,e,t),this.z=Ye(this.z,e,t),this.w=Ye(this.w,e,t),this}clampLength(e,t){let i=this.length();return this.divideScalar(i||1).multiplyScalar(Ye(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this.z=e.z+(t.z-e.z)*i,this.w=e.w+(t.w-e.w)*i,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},Yl=class extends Qn{constructor(e=1,t=1,i={}){super(),i=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:pn,depthBuffer:!0,stencilBuffer:!1,resolveColorBuffer:!0,resolveDepthBuffer:!0,resolveStencilBuffer:!0,storeMultisampledColorBuffer:!0,storeMultisampledDepthBuffer:!0,storeMultisampledStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},i),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=i.depth,this.scissor=new at(0,0,e,t),this.scissorTest=!1,this.viewport=new at(0,0,e,t),this.textures=[];let r=i.count;for(let s=0;s<r;s++)this.textures[s]=new tn({width:e,height:t,depth:i.depth}),this.textures[s].isRenderTargetTexture=!0,this.textures[s].renderTarget=this;this._setTextureOptions(i),this.depthBuffer=i.depthBuffer,this.stencilBuffer=i.stencilBuffer,this.resolveColorBuffer=i.resolveColorBuffer,this.resolveDepthBuffer=i.resolveDepthBuffer,this.resolveStencilBuffer=i.resolveStencilBuffer,this.storeMultisampledColorBuffer=i.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=i.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=i.storeMultisampledStencilBuffer,this._depthTexture=null,this.depthTexture=i.depthTexture,this.samples=i.samples,this.multiview=i.multiview,this.useArrayDepthTexture=i.useArrayDepthTexture}_setTextureOptions(e={}){let t={minFilter:pn,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.mipmapsAutoUpdate!==void 0&&(t.mipmapsAutoUpdate=e.mipmapsAutoUpdate),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let i=0;i<this.textures.length;i++)this.textures[i].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&this._depthTexture.renderTarget===this&&(this._depthTexture.renderTarget=null),e!==null&&e.renderTarget===null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,i=1){if(this.width!==e||this.height!==t||this.depth!==i){this.width=e,this.height=t,this.depth=i;for(let r=0,s=this.textures.length;r<s;r++)this.textures[r].image.width=e,this.textures[r].image.height=t,this.textures[r].image.depth=i,this.textures[r].isData3DTexture!==!0&&(this.textures[r].isArrayTexture=this.textures[r].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,i=e.textures.length;t<i;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;let r=Object.assign({},e.textures[t].image);this.textures[t].source=new Es(r)}if(this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveColorBuffer=e.resolveColorBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,this.storeMultisampledColorBuffer=e.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=e.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=e.storeMultisampledStencilBuffer,e.depthTexture!==null)if(e.depthTexture.renderTarget===e){let t=e.depthTexture.clone();t.renderTarget=null,this.depthTexture=t}else this.depthTexture=e.depthTexture;else this.depthTexture=null;return this.samples=e.samples,this.multiview=e.multiview,this.useArrayDepthTexture=e.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}},mn=class extends Yl{constructor(e=1,t=1,i={}){super(e,t,i),this.isWebGLRenderTarget=!0}},Uo=class extends tn{constructor(e=null,t=1,i=1,r=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:i,depth:r},this.magFilter=xt,this.minFilter=xt,this.wrapR=mi,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}};var Jl=class extends tn{constructor(e=null,t=1,i=1,r=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:i,depth:r},this.magFilter=xt,this.minFilter=xt,this.wrapR=mi,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}};var ft=class n{static{this.prototype.isMatrix4=!0}constructor(e,t,i,r,s,o,a,l,c,h,u,f,d,p,y,m){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,i,r,s,o,a,l,c,h,u,f,d,p,y,m)}set(e,t,i,r,s,o,a,l,c,h,u,f,d,p,y,m){let g=this.elements;return g[0]=e,g[4]=t,g[8]=i,g[12]=r,g[1]=s,g[5]=o,g[9]=a,g[13]=l,g[2]=c,g[6]=h,g[10]=u,g[14]=f,g[3]=d,g[7]=p,g[11]=y,g[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new n().fromArray(this.elements)}copy(e){let t=this.elements,i=e.elements;return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=i[3],t[4]=i[4],t[5]=i[5],t[6]=i[6],t[7]=i[7],t[8]=i[8],t[9]=i[9],t[10]=i[10],t[11]=i[11],t[12]=i[12],t[13]=i[13],t[14]=i[14],t[15]=i[15],this}copyPosition(e){let t=this.elements,i=e.elements;return t[12]=i[12],t[13]=i[13],t[14]=i[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,i){return this.determinantAffine()===0?(e.set(1,0,0),t.set(0,1,0),i.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),i.setFromMatrixColumn(this,2),this)}makeBasis(e,t,i){return this.set(e.x,t.x,i.x,0,e.y,t.y,i.y,0,e.z,t.z,i.z,0,0,0,0,1),this}extractRotation(e){if(e.determinantAffine()===0)return this.identity();let t=this.elements,i=e.elements,r=1/cs.setFromMatrixColumn(e,0).length(),s=1/cs.setFromMatrixColumn(e,1).length(),o=1/cs.setFromMatrixColumn(e,2).length();return t[0]=i[0]*r,t[1]=i[1]*r,t[2]=i[2]*r,t[3]=0,t[4]=i[4]*s,t[5]=i[5]*s,t[6]=i[6]*s,t[7]=0,t[8]=i[8]*o,t[9]=i[9]*o,t[10]=i[10]*o,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,i=e.x,r=e.y,s=e.z,o=Math.cos(i),a=Math.sin(i),l=Math.cos(r),c=Math.sin(r),h=Math.cos(s),u=Math.sin(s);if(e.order==="XYZ"){let f=o*h,d=o*u,p=a*h,y=a*u;t[0]=l*h,t[4]=-l*u,t[8]=c,t[1]=d+p*c,t[5]=f-y*c,t[9]=-a*l,t[2]=y-f*c,t[6]=p+d*c,t[10]=o*l}else if(e.order==="YXZ"){let f=l*h,d=l*u,p=c*h,y=c*u;t[0]=f+y*a,t[4]=p*a-d,t[8]=o*c,t[1]=o*u,t[5]=o*h,t[9]=-a,t[2]=d*a-p,t[6]=y+f*a,t[10]=o*l}else if(e.order==="ZXY"){let f=l*h,d=l*u,p=c*h,y=c*u;t[0]=f-y*a,t[4]=-o*u,t[8]=p+d*a,t[1]=d+p*a,t[5]=o*h,t[9]=y-f*a,t[2]=-o*c,t[6]=a,t[10]=o*l}else if(e.order==="ZYX"){let f=o*h,d=o*u,p=a*h,y=a*u;t[0]=l*h,t[4]=p*c-d,t[8]=f*c+y,t[1]=l*u,t[5]=y*c+f,t[9]=d*c-p,t[2]=-c,t[6]=a*l,t[10]=o*l}else if(e.order==="YZX"){let f=o*l,d=o*c,p=a*l,y=a*c;t[0]=l*h,t[4]=y-f*u,t[8]=p*u+d,t[1]=u,t[5]=o*h,t[9]=-a*h,t[2]=-c*h,t[6]=d*u+p,t[10]=f-y*u}else if(e.order==="XZY"){let f=o*l,d=o*c,p=a*l,y=a*c;t[0]=l*h,t[4]=-u,t[8]=c*h,t[1]=f*u+y,t[5]=o*h,t[9]=d*u-p,t[2]=p*u-d,t[6]=a*h,t[10]=y*u+f}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(wx,e,Ex)}lookAt(e,t,i){let r=this.elements;return En.subVectors(e,t),En.lengthSq()===0&&(En.z=1),En.normalize(),Ji.crossVectors(i,En),Ji.lengthSq()===0&&(Math.abs(i.z)===1?En.x+=1e-4:En.z+=1e-4,En.normalize(),Ji.crossVectors(i,En)),Ji.normalize(),fl.crossVectors(En,Ji),r[0]=Ji.x,r[4]=fl.x,r[8]=En.x,r[1]=Ji.y,r[5]=fl.y,r[9]=En.y,r[2]=Ji.z,r[6]=fl.z,r[10]=En.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let i=e.elements,r=t.elements,s=this.elements,o=i[0],a=i[4],l=i[8],c=i[12],h=i[1],u=i[5],f=i[9],d=i[13],p=i[2],y=i[6],m=i[10],g=i[14],b=i[3],_=i[7],x=i[11],M=i[15],E=r[0],v=r[4],A=r[8],L=r[12],C=r[1],k=r[5],H=r[9],j=r[13],I=r[2],V=r[6],G=r[10],W=r[14],te=r[3],X=r[7],ee=r[11],ne=r[15];return s[0]=o*E+a*C+l*I+c*te,s[4]=o*v+a*k+l*V+c*X,s[8]=o*A+a*H+l*G+c*ee,s[12]=o*L+a*j+l*W+c*ne,s[1]=h*E+u*C+f*I+d*te,s[5]=h*v+u*k+f*V+d*X,s[9]=h*A+u*H+f*G+d*ee,s[13]=h*L+u*j+f*W+d*ne,s[2]=p*E+y*C+m*I+g*te,s[6]=p*v+y*k+m*V+g*X,s[10]=p*A+y*H+m*G+g*ee,s[14]=p*L+y*j+m*W+g*ne,s[3]=b*E+_*C+x*I+M*te,s[7]=b*v+_*k+x*V+M*X,s[11]=b*A+_*H+x*G+M*ee,s[15]=b*L+_*j+x*W+M*ne,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],i=e[4],r=e[8],s=e[12],o=e[1],a=e[5],l=e[9],c=e[13],h=e[2],u=e[6],f=e[10],d=e[14],p=e[3],y=e[7],m=e[11],g=e[15],b=l*d-c*f,_=a*d-c*u,x=a*f-l*u,M=o*d-c*h,E=o*f-l*h,v=o*u-a*h;return t*(y*b-m*_+g*x)-i*(p*b-m*M+g*E)+r*(p*_-y*M+g*v)-s*(p*x-y*E+m*v)}determinantAffine(){let e=this.elements,t=e[0],i=e[4],r=e[8],s=e[1],o=e[5],a=e[9],l=e[2],c=e[6],h=e[10];return t*(o*h-a*c)-i*(s*h-a*l)+r*(s*c-o*l)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,i){let r=this.elements;return e.isVector3?(r[12]=e.x,r[13]=e.y,r[14]=e.z):(r[12]=e,r[13]=t,r[14]=i),this}invert(){let e=this.elements,t=e[0],i=e[1],r=e[2],s=e[3],o=e[4],a=e[5],l=e[6],c=e[7],h=e[8],u=e[9],f=e[10],d=e[11],p=e[12],y=e[13],m=e[14],g=e[15],b=t*a-i*o,_=t*l-r*o,x=t*c-s*o,M=i*l-r*a,E=i*c-s*a,v=r*c-s*l,A=h*y-u*p,L=h*m-f*p,C=h*g-d*p,k=u*m-f*y,H=u*g-d*y,j=f*g-d*m,I=b*j-_*H+x*k+M*C-E*L+v*A;if(I===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let V=1/I;return e[0]=(a*j-l*H+c*k)*V,e[1]=(r*H-i*j-s*k)*V,e[2]=(y*v-m*E+g*M)*V,e[3]=(f*E-u*v-d*M)*V,e[4]=(l*C-o*j-c*L)*V,e[5]=(t*j-r*C+s*L)*V,e[6]=(m*x-p*v-g*_)*V,e[7]=(h*v-f*x+d*_)*V,e[8]=(o*H-a*C+c*A)*V,e[9]=(i*C-t*H-s*A)*V,e[10]=(p*E-y*x+g*b)*V,e[11]=(u*x-h*E-d*b)*V,e[12]=(a*L-o*k-l*A)*V,e[13]=(t*k-i*L+r*A)*V,e[14]=(y*_-p*M-m*b)*V,e[15]=(h*M-u*_+f*b)*V,this}scale(e){let t=this.elements,i=e.x,r=e.y,s=e.z;return t[0]*=i,t[4]*=r,t[8]*=s,t[1]*=i,t[5]*=r,t[9]*=s,t[2]*=i,t[6]*=r,t[10]*=s,t[3]*=i,t[7]*=r,t[11]*=s,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],i=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],r=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,i,r))}makeTranslation(e,t,i){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,i,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),i=Math.sin(e);return this.set(1,0,0,0,0,t,-i,0,0,i,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),i=Math.sin(e);return this.set(t,0,i,0,0,1,0,0,-i,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),i=Math.sin(e);return this.set(t,-i,0,0,i,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let i=Math.cos(t),r=Math.sin(t),s=1-i,o=e.x,a=e.y,l=e.z,c=s*o,h=s*a;return this.set(c*o+i,c*a-r*l,c*l+r*a,0,c*a+r*l,h*a+i,h*l-r*o,0,c*l-r*a,h*l+r*o,s*l*l+i,0,0,0,0,1),this}makeScale(e,t,i){return this.set(e,0,0,0,0,t,0,0,0,0,i,0,0,0,0,1),this}makeShear(e,t,i,r,s,o){return this.set(1,i,s,0,e,1,o,0,t,r,1,0,0,0,0,1),this}compose(e,t,i){let r=this.elements,s=t._x,o=t._y,a=t._z,l=t._w,c=s+s,h=o+o,u=a+a,f=s*c,d=s*h,p=s*u,y=o*h,m=o*u,g=a*u,b=l*c,_=l*h,x=l*u,M=i.x,E=i.y,v=i.z;return r[0]=(1-(y+g))*M,r[1]=(d+x)*M,r[2]=(p-_)*M,r[3]=0,r[4]=(d-x)*E,r[5]=(1-(f+g))*E,r[6]=(m+b)*E,r[7]=0,r[8]=(p+_)*v,r[9]=(m-b)*v,r[10]=(1-(f+y))*v,r[11]=0,r[12]=e.x,r[13]=e.y,r[14]=e.z,r[15]=1,this}decompose(e,t,i){let r=this.elements;e.x=r[12],e.y=r[13],e.z=r[14];let s=this.determinantAffine();if(s===0)return i.set(1,1,1),t.identity(),this;let o=cs.set(r[0],r[1],r[2]).length(),a=cs.set(r[4],r[5],r[6]).length(),l=cs.set(r[8],r[9],r[10]).length();s<0&&(o=-o),Jn.copy(this);let c=1/o,h=1/a,u=1/l;return Jn.elements[0]*=c,Jn.elements[1]*=c,Jn.elements[2]*=c,Jn.elements[4]*=h,Jn.elements[5]*=h,Jn.elements[6]*=h,Jn.elements[8]*=u,Jn.elements[9]*=u,Jn.elements[10]*=u,t.setFromRotationMatrix(Jn),i.x=o,i.y=a,i.z=l,this}makePerspective(e,t,i,r,s,o,a=$n,l=!1){let c=this.elements,h=2*s/(t-e),u=2*s/(i-r),f=(t+e)/(t-e),d=(i+r)/(i-r),p,y;if(l)p=s/(o-s),y=o*s/(o-s);else if(a===$n)p=-(o+s)/(o-s),y=-2*o*s/(o-s);else if(a===No)p=-o/(o-s),y=-o*s/(o-s);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return c[0]=h,c[4]=0,c[8]=f,c[12]=0,c[1]=0,c[5]=u,c[9]=d,c[13]=0,c[2]=0,c[6]=0,c[10]=p,c[14]=y,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,i,r,s,o,a=$n,l=!1){let c=this.elements,h=2/(t-e),u=2/(i-r),f=-(t+e)/(t-e),d=-(i+r)/(i-r),p,y;if(l)p=1/(o-s),y=o/(o-s);else if(a===$n)p=-2/(o-s),y=-(o+s)/(o-s);else if(a===No)p=-1/(o-s),y=-s/(o-s);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return c[0]=h,c[4]=0,c[8]=0,c[12]=f,c[1]=0,c[5]=u,c[9]=0,c[13]=d,c[2]=0,c[6]=0,c[10]=p,c[14]=y,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){let t=this.elements,i=e.elements;for(let r=0;r<16;r++)if(t[r]!==i[r])return!1;return!0}fromArray(e,t=0){for(let i=0;i<16;i++)this.elements[i]=e[i+t];return this}toArray(e=[],t=0){let i=this.elements;return e[t]=i[0],e[t+1]=i[1],e[t+2]=i[2],e[t+3]=i[3],e[t+4]=i[4],e[t+5]=i[5],e[t+6]=i[6],e[t+7]=i[7],e[t+8]=i[8],e[t+9]=i[9],e[t+10]=i[10],e[t+11]=i[11],e[t+12]=i[12],e[t+13]=i[13],e[t+14]=i[14],e[t+15]=i[15],e}},cs=new O,Jn=new ft,wx=new O(0,0,0),Ex=new O(1,1,1),Ji=new O,fl=new O,En=new O,sm=new ft,om=new Cn,nr=class n{constructor(e=0,t=0,i=0,r=n.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=i,this._order=r}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,i,r=this._order){return this._x=e,this._y=t,this._z=i,this._order=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,i=!0){let r=e.elements,s=r[0],o=r[4],a=r[8],l=r[1],c=r[5],h=r[9],u=r[2],f=r[6],d=r[10];switch(t){case"XYZ":this._y=Math.asin(Ye(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-h,d),this._z=Math.atan2(-o,s)):(this._x=Math.atan2(f,c),this._z=0);break;case"YXZ":this._x=Math.asin(-Ye(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(a,d),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-u,s),this._z=0);break;case"ZXY":this._x=Math.asin(Ye(f,-1,1)),Math.abs(f)<.9999999?(this._y=Math.atan2(-u,d),this._z=Math.atan2(-o,c)):(this._y=0,this._z=Math.atan2(l,s));break;case"ZYX":this._y=Math.asin(-Ye(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(f,d),this._z=Math.atan2(l,s)):(this._x=0,this._z=Math.atan2(-o,c));break;case"YZX":this._z=Math.asin(Ye(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-u,s)):(this._x=0,this._y=Math.atan2(a,d));break;case"XZY":this._z=Math.asin(-Ye(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(f,c),this._y=Math.atan2(a,s)):(this._x=Math.atan2(-h,d),this._y=0);break;default:Ie("Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,i===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,i){return sm.makeRotationFromQuaternion(e),this.setFromRotationMatrix(sm,t,i)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return om.setFromEuler(this),this.setFromQuaternion(om,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};nr.DEFAULT_ORDER="XYZ";var Bo=class{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}},Tx=0,am=new O,hs=new Cn,Ti=new ft,pl=new O,Eo=new O,Ax=new O,Rx=new Cn,lm=new O(1,0,0),cm=new O(0,1,0),hm=new O(0,0,1),um={type:"added"},Cx={type:"removed"},us={type:"childadded",child:null},Pu={type:"childremoved",child:null},Yt=class n extends Qn{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Tx++}),this.uuid=ur(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=n.DEFAULT_UP.clone();let e=new O,t=new nr,i=new Cn,r=new O(1,1,1);function s(){i.setFromEuler(t,!1)}function o(){t.setFromQuaternion(i,void 0,!1)}t._onChange(s),i._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:i},scale:{configurable:!0,enumerable:!0,value:r},modelViewMatrix:{value:new ft},normalMatrix:{value:new Ue}}),this.matrix=new ft,this.matrixWorld=new ft,this.matrixAutoUpdate=n.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=n.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Bo,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale),this.pivot!==null&&this.position.copy(this.pivot).applyMatrix4(this.matrix).sub(this.pivot)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return hs.setFromAxisAngle(e,t),this.quaternion.multiply(hs),this}rotateOnWorldAxis(e,t){return hs.setFromAxisAngle(e,t),this.quaternion.premultiply(hs),this}rotateX(e){return this.rotateOnAxis(lm,e)}rotateY(e){return this.rotateOnAxis(cm,e)}rotateZ(e){return this.rotateOnAxis(hm,e)}translateOnAxis(e,t){return am.copy(e).applyQuaternion(this.quaternion),this.position.add(am.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(lm,e)}translateY(e){return this.translateOnAxis(cm,e)}translateZ(e){return this.translateOnAxis(hm,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(Ti.copy(this.matrixWorld).invert())}lookAt(e,t,i){e.isVector3?pl.copy(e):pl.set(e,t,i);let r=this.parent;this.updateWorldMatrix(!0,!1),Eo.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Ti.lookAt(Eo,pl,this.up):Ti.lookAt(pl,Eo,this.up),this.quaternion.setFromRotationMatrix(Ti),r&&(Ti.extractRotation(r.matrixWorld),hs.setFromRotationMatrix(Ti),this.quaternion.premultiply(hs.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(Fe("Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(um),us.child=e,this.dispatchEvent(us),us.child=null):Fe("Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let i=0;i<arguments.length;i++)this.remove(arguments[i]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(Cx),Pu.child=e,this.dispatchEvent(Pu),Pu.child=null),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),Ti.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),Ti.multiply(e.parent.matrixWorld)),e.applyMatrix4(Ti),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(um),us.child=e,this.dispatchEvent(us),us.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let i=0,r=this.children.length;i<r;i++){let o=this.children[i].getObjectByProperty(e,t);if(o!==void 0)return o}}getObjectsByProperty(e,t,i=[]){this[e]===t&&i.push(this);let r=this.children;for(let s=0,o=r.length;s<o;s++)r[s].getObjectsByProperty(e,t,i);return i}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Eo,e,Ax),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Eo,Rx,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}intersectsFrustum(){return!0}traverse(e){e(this);let t=this.children;for(let i=0,r=t.length;i<r;i++)t[i].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let i=0,r=t.length;i<r;i++)t[i].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let e=this.pivot;if(e!==null){let t=e.x,i=e.y,r=e.z,s=this.matrix.elements;s[12]+=t-s[0]*t-s[4]*i-s[8]*r,s[13]+=i-s[1]*t-s[5]*i-s[9]*r,s[14]+=r-s[2]*t-s[6]*i-s[10]*r}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let i=0,r=t.length;i<r;i++)t[i].updateMatrixWorld(e)}updateWorldMatrix(e,t,i=!1){let r=this.parent;if(e===!0&&r!==null&&r.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||i)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,i=!0),t===!0){let s=this.children;for(let o=0,a=s.length;o<a;o++)s[o].updateWorldMatrix(!1,!0,i)}}toJSON(e){let t=e===void 0||typeof e=="string",i={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},i.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let r={};r.uuid=this.uuid,r.type=this.type,r.name=this.name,r.castShadow=this.castShadow,r.receiveShadow=this.receiveShadow,r.visible=this.visible,r.frustumCulled=this.frustumCulled,r.renderOrder=this.renderOrder,r.static=this.static,r.matrixAutoUpdate=this.matrixAutoUpdate,Object.keys(this.userData).length>0&&(r.userData=this.userData),r.layers=this.layers.mask,r.matrix=this.matrix.toArray(),r.up=this.up.toArray(),this.pivot!==null&&(r.pivot=this.pivot.toArray()),this.morphTargetDictionary!==void 0&&(r.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(r.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(r.type="InstancedMesh",r.count=this.count,r.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(r.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(r.type="BatchedMesh",r.perObjectFrustumCulled=this.perObjectFrustumCulled,r.sortObjects=this.sortObjects,r.drawRanges=this._drawRanges,r.reservedRanges=this._reservedRanges,r.geometryInfo=this._geometryInfo.map(a=>({...a,boundingBox:a.boundingBox?a.boundingBox.toJSON():void 0,boundingSphere:a.boundingSphere?a.boundingSphere.toJSON():void 0})),r.instanceInfo=this._instanceInfo.map(a=>({...a})),r.availableInstanceIds=this._availableInstanceIds.slice(),r.availableGeometryIds=this._availableGeometryIds.slice(),r.nextIndexStart=this._nextIndexStart,r.nextVertexStart=this._nextVertexStart,r.geometryCount=this._geometryCount,r.maxInstanceCount=this._maxInstanceCount,r.maxVertexCount=this._maxVertexCount,r.maxIndexCount=this._maxIndexCount,r.geometryInitialized=this._geometryInitialized,r.matricesTexture=this._matricesTexture.toJSON(e),r.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(r.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(r.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(r.boundingBox=this.boundingBox.toJSON()));function s(a,l){return a[l.uuid]===void 0&&(a[l.uuid]=l.toJSON(e)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?r.background=this.background.toJSON():this.background.isTexture&&(r.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(r.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){r.geometry=s(e.geometries,this.geometry);let a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){let l=a.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){let u=l[c];s(e.shapes,u)}else s(e.shapes,l)}}if(this.isSkinnedMesh&&(r.bindMode=this.bindMode,r.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(s(e.skeletons,this.skeleton),r.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let a=[];for(let l=0,c=this.material.length;l<c;l++)a.push(s(e.materials,this.material[l]));r.material=a}else r.material=s(e.materials,this.material);if(this.children.length>0){r.children=[];for(let a=0;a<this.children.length;a++)r.children.push(this.children[a].toJSON(e).object)}if(this.animations.length>0){r.animations=[];for(let a=0;a<this.animations.length;a++){let l=this.animations[a];r.animations.push(s(e.animations,l))}}if(t){let a=o(e.geometries),l=o(e.materials),c=o(e.textures),h=o(e.images),u=o(e.shapes),f=o(e.skeletons),d=o(e.animations),p=o(e.nodes);a.length>0&&(i.geometries=a),l.length>0&&(i.materials=l),c.length>0&&(i.textures=c),h.length>0&&(i.images=h),u.length>0&&(i.shapes=u),f.length>0&&(i.skeletons=f),d.length>0&&(i.animations=d),p.length>0&&(i.nodes=p)}return i.object=r,i;function o(a){let l=[];for(let c in a){let h=a[c];delete h.metadata,l.push(h)}return l}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.pivot=e.pivot!==null?e.pivot.clone():null,this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let i=0;i<e.children.length;i++){let r=e.children[i];this.add(r.clone())}return this}dispose(){this.dispatchEvent({type:"dispose"})}};Yt.DEFAULT_UP=new O(0,1,0);Yt.DEFAULT_MATRIX_AUTO_UPDATE=!0;Yt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var fn=class extends Yt{constructor(){super(),this.isGroup=!0,this.type="Group"}},Px={type:"move"},Ts=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new fn,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new fn,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new O,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new O),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new fn,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new O,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new O,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let i of e.hand.values())this._getHandJoint(t,i)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,i){let r=null,s=null,o=null,a=this._targetRay,l=this._grip,c=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(c&&e.hand){o=!0;for(let y of e.hand.values()){let m=t.getJointPose(y,i),g=this._getHandJoint(c,y);m!==null&&(g.matrix.fromArray(m.transform.matrix),g.matrix.decompose(g.position,g.quaternion,g.scale),g.matrixWorldNeedsUpdate=!0,g.jointRadius=m.radius),g.visible=m!==null}let h=c.joints["index-finger-tip"],u=c.joints["thumb-tip"],f=h.position.distanceTo(u.position),d=.02,p=.005;c.inputState.pinching&&f>d+p?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!c.inputState.pinching&&f<=d-p&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else l!==null&&e.gripSpace&&(s=t.getPose(e.gripSpace,i),s!==null&&(l.matrix.fromArray(s.transform.matrix),l.matrix.decompose(l.position,l.quaternion,l.scale),l.matrixWorldNeedsUpdate=!0,s.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(s.linearVelocity)):l.hasLinearVelocity=!1,s.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(s.angularVelocity)):l.hasAngularVelocity=!1,l.eventsEnabled&&l.dispatchEvent({type:"gripUpdated",data:e,target:this})));a!==null&&(r=t.getPose(e.targetRaySpace,i),r===null&&s!==null&&(r=s),r!==null&&(a.matrix.fromArray(r.transform.matrix),a.matrix.decompose(a.position,a.quaternion,a.scale),a.matrixWorldNeedsUpdate=!0,r.linearVelocity?(a.hasLinearVelocity=!0,a.linearVelocity.copy(r.linearVelocity)):a.hasLinearVelocity=!1,r.angularVelocity?(a.hasAngularVelocity=!0,a.angularVelocity.copy(r.angularVelocity)):a.hasAngularVelocity=!1,this.dispatchEvent(Px)))}return a!==null&&(a.visible=r!==null),l!==null&&(l.visible=s!==null),c!==null&&(c.visible=o!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let i=new fn;i.matrixAutoUpdate=!1,i.visible=!1,e.joints[t.jointName]=i,e.add(i)}return e.joints[t.jointName]}},dg={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Zi={h:0,s:0,l:0},ml={h:0,s:0,l:0};function Iu(n,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?n+(e-n)*6*t:t<1/2?e:t<2/3?n+(e-n)*6*(2/3-t):n}var je=class{constructor(e,t,i){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,i)}set(e,t,i){if(t===void 0&&i===void 0){let r=e;r&&r.isColor?this.copy(r):typeof r=="number"?this.setHex(r):typeof r=="string"&&this.setStyle(r)}else this.setRGB(e,t,i);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=An){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,qe.colorSpaceToWorking(this,t),this}setRGB(e,t,i,r=qe.workingColorSpace){return this.r=e,this.g=t,this.b=i,qe.colorSpaceToWorking(this,r),this}setHSL(e,t,i,r=qe.workingColorSpace){if(e=Rd(e,1),t=Ye(t,0,1),i=Ye(i,0,1),t===0)this.r=this.g=this.b=i;else{let s=i<=.5?i*(1+t):i+t-i*t,o=2*i-s;this.r=Iu(o,s,e+1/3),this.g=Iu(o,s,e),this.b=Iu(o,s,e-1/3)}return qe.colorSpaceToWorking(this,r),this}setStyle(e,t=An){function i(s){s!==void 0&&parseFloat(s)<1&&Ie("Color: Alpha component of "+e+" will be ignored.")}let r;if(r=/^(\w+)\(([^\)]*)\)/.exec(e)){let s,o=r[1],a=r[2];switch(o){case"rgb":case"rgba":if(s=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/.exec(a))return i(s[4]),this.setRGB(Math.min(255,parseInt(s[1],10))/255,Math.min(255,parseInt(s[2],10))/255,Math.min(255,parseInt(s[3],10))/255,t);if(s=/^\s*(\d+(?:\.\d+)?|\.\d+)\%\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/.exec(a))return i(s[4]),this.setRGB(Math.min(100,parseFloat(s[1]))/100,Math.min(100,parseFloat(s[2]))/100,Math.min(100,parseFloat(s[3]))/100,t);break;case"hsl":case"hsla":if(s=/^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/.exec(a))return i(s[4]),this.setHSL(parseFloat(s[1])/360,parseFloat(s[2])/100,parseFloat(s[3])/100,t);break;default:Ie("Color: Unknown color model "+e)}}else if(r=/^\#([A-Fa-f\d]+)$/.exec(e)){let s=r[1],o=s.length;if(o===3)return this.setRGB(parseInt(s.charAt(0),16)/15,parseInt(s.charAt(1),16)/15,parseInt(s.charAt(2),16)/15,t);if(o===6)return this.setHex(parseInt(s,16),t);Ie("Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=An){let i=dg[e.toLowerCase()];return i!==void 0?this.setHex(i,t):Ie("Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=Ii(e.r),this.g=Ii(e.g),this.b=Ii(e.b),this}copyLinearToSRGB(e){return this.r=_s(e.r),this.g=_s(e.g),this.b=_s(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=An){return qe.workingToColorSpace(ln.copy(this),e),Math.round(Ye(ln.r*255,0,255))*65536+Math.round(Ye(ln.g*255,0,255))*256+Math.round(Ye(ln.b*255,0,255))}getHexString(e=An){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=qe.workingColorSpace){qe.workingToColorSpace(ln.copy(this),t);let i=ln.r,r=ln.g,s=ln.b,o=Math.max(i,r,s),a=Math.min(i,r,s),l,c,h=(a+o)/2;if(a===o)l=0,c=0;else{let u=o-a;switch(c=h<=.5?u/(o+a):u/(2-o-a),o){case i:l=(r-s)/u+(r<s?6:0);break;case r:l=(s-i)/u+2;break;case s:l=(i-r)/u+4;break}l/=6}return e.h=l,e.s=c,e.l=h,e}getRGB(e,t=qe.workingColorSpace){return qe.workingToColorSpace(ln.copy(this),t),e.r=ln.r,e.g=ln.g,e.b=ln.b,e}getStyle(e=An){qe.workingToColorSpace(ln.copy(this),e);let t=ln.r,i=ln.g,r=ln.b;return e!==An?`color(${e} ${t.toFixed(3)} ${i.toFixed(3)} ${r.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(i*255)},${Math.round(r*255)})`}offsetHSL(e,t,i){return this.getHSL(Zi),this.setHSL(Zi.h+e,Zi.s+t,Zi.l+i)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,i){return this.r=e.r+(t.r-e.r)*i,this.g=e.g+(t.g-e.g)*i,this.b=e.b+(t.b-e.b)*i,this}lerpHSL(e,t){this.getHSL(Zi),e.getHSL(ml);let i=Lo(Zi.h,ml.h,t),r=Lo(Zi.s,ml.s,t),s=Lo(Zi.l,ml.l,t);return this.setHSL(i,r,s),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,i=this.g,r=this.b,s=e.elements;return this.r=s[0]*t+s[3]*i+s[6]*r,this.g=s[1]*t+s[4]*i+s[7]*r,this.b=s[2]*t+s[5]*i+s[8]*r,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},ln=new je;je.NAMES=dg;var Fr=class extends Yt{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new nr,this.environmentIntensity=1,this.environmentRotation=new nr,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),this.background=e.background!==null?e.background.clone():null,this.environment=e.environment!==null?e.environment.clone():null,this.fog=e.fog!==null?e.fog.clone():null,this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),this.overrideMaterial=e.overrideMaterial!==null?e.overrideMaterial.clone():null,this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),t.object.backgroundBlurriness=this.backgroundBlurriness,t.object.backgroundIntensity=this.backgroundIntensity,t.object.backgroundRotation=this.backgroundRotation.toArray(),t.object.environmentIntensity=this.environmentIntensity,t.object.environmentRotation=this.environmentRotation.toArray(),t}},Zn=new O,Ai=new O,Lu=new O,Ri=new O,ds=new O,fs=new O,dm=new O,Du=new O,ku=new O,Nu=new O,Ou=new at,Fu=new at,Uu=new at,tr=class n{constructor(e=new O,t=new O,i=new O){this.a=e,this.b=t,this.c=i}static getNormal(e,t,i,r){r.subVectors(i,t),Zn.subVectors(e,t),r.cross(Zn);let s=r.lengthSq();return s>0?r.multiplyScalar(1/Math.sqrt(s)):r.set(0,0,0)}static getBarycoord(e,t,i,r,s){Zn.subVectors(r,t),Ai.subVectors(i,t),Lu.subVectors(e,t);let o=Zn.dot(Zn),a=Zn.dot(Ai),l=Zn.dot(Lu),c=Ai.dot(Ai),h=Ai.dot(Lu),u=o*c-a*a;if(u===0)return s.set(0,0,0),null;let f=1/u,d=(c*l-a*h)*f,p=(o*h-a*l)*f;return s.set(1-d-p,p,d)}static containsPoint(e,t,i,r){return this.getBarycoord(e,t,i,r,Ri)===null?!1:Ri.x>=0&&Ri.y>=0&&Ri.x+Ri.y<=1}static getInterpolation(e,t,i,r,s,o,a,l){return this.getBarycoord(e,t,i,r,Ri)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(s,Ri.x),l.addScaledVector(o,Ri.y),l.addScaledVector(a,Ri.z),l)}static getInterpolatedAttribute(e,t,i,r,s,o){return Ou.setScalar(0),Fu.setScalar(0),Uu.setScalar(0),Ou.fromBufferAttribute(e,t),Fu.fromBufferAttribute(e,i),Uu.fromBufferAttribute(e,r),o.setScalar(0),o.addScaledVector(Ou,s.x),o.addScaledVector(Fu,s.y),o.addScaledVector(Uu,s.z),o}static isFrontFacing(e,t,i,r){return Zn.subVectors(i,t),Ai.subVectors(e,t),Zn.cross(Ai).dot(r)<0}set(e,t,i){return this.a.copy(e),this.b.copy(t),this.c.copy(i),this}setFromPointsAndIndices(e,t,i,r){return this.a.copy(e[t]),this.b.copy(e[i]),this.c.copy(e[r]),this}setFromAttributeAndIndices(e,t,i,r){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,i),this.c.fromBufferAttribute(e,r),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return Zn.subVectors(this.c,this.b),Ai.subVectors(this.a,this.b),Zn.cross(Ai).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return n.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return n.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,i,r,s){return n.getInterpolation(e,this.a,this.b,this.c,t,i,r,s)}containsPoint(e){return n.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return n.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let i=this.a,r=this.b,s=this.c,o,a;ds.subVectors(r,i),fs.subVectors(s,i),Du.subVectors(e,i);let l=ds.dot(Du),c=fs.dot(Du);if(l<=0&&c<=0)return t.copy(i);ku.subVectors(e,r);let h=ds.dot(ku),u=fs.dot(ku);if(h>=0&&u<=h)return t.copy(r);let f=l*u-h*c;if(f<=0&&l>=0&&h<=0&&l-h>0)return o=l/(l-h),t.copy(i).addScaledVector(ds,o);Nu.subVectors(e,s);let d=ds.dot(Nu),p=fs.dot(Nu);if(p>=0&&d<=p)return t.copy(s);let y=d*c-l*p;if(y<=0&&c>=0&&p<=0)return a=c/(c-p),t.copy(i).addScaledVector(fs,a);let m=h*p-d*u;if(m<=0&&u-h>=0&&d-p>=0)return dm.subVectors(s,r),a=(u-h)/(u-h+(d-p)),t.copy(r).addScaledVector(dm,a);let g=1/(m+y+f);return o=y*g,a=f*g,t.copy(i).addScaledVector(ds,o).addScaledVector(fs,a)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}},ei=class{constructor(e=new O(1/0,1/0,1/0),t=new O(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t+=3)this.expandByPoint(Kn.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,i=e.count;t<i;t++)this.expandByPoint(Kn.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let i=Kn.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(i),this.max.copy(e).add(i),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let i=e.geometry;if(i!==void 0){let s=i.getAttribute("position");if(t===!0&&s!==void 0&&e.isInstancedMesh!==!0&&e.isBatchedMesh!==!0)for(let o=0,a=s.count;o<a;o++)e.isMesh===!0?e.getVertexPosition(o,Kn):Kn.fromBufferAttribute(s,o),Kn.applyMatrix4(e.matrixWorld),this.expandByPoint(Kn);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),gl.copy(e.boundingBox)):(i.boundingBox===null&&i.computeBoundingBox(),gl.copy(i.boundingBox)),gl.applyMatrix4(e.matrixWorld),this.union(gl)}let r=e.children;for(let s=0,o=r.length;s<o;s++)this.expandByObject(r[s],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,Kn),Kn.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,i;return e.normal.x>0?(t=e.normal.x*this.min.x,i=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,i=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,i+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,i+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,i+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,i+=e.normal.z*this.min.z),t<=-e.constant&&i>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(To),yl.subVectors(this.max,To),ps.subVectors(e.a,To),ms.subVectors(e.b,To),gs.subVectors(e.c,To),Ki.subVectors(ms,ps),Qi.subVectors(gs,ms),Ir.subVectors(ps,gs);let t=[0,-Ki.z,Ki.y,0,-Qi.z,Qi.y,0,-Ir.z,Ir.y,Ki.z,0,-Ki.x,Qi.z,0,-Qi.x,Ir.z,0,-Ir.x,-Ki.y,Ki.x,0,-Qi.y,Qi.x,0,-Ir.y,Ir.x,0];return!Bu(t,ps,ms,gs,yl)||(t=[1,0,0,0,1,0,0,0,1],!Bu(t,ps,ms,gs,yl))?!1:(bl.crossVectors(Ki,Qi),t=[bl.x,bl.y,bl.z],Bu(t,ps,ms,gs,yl))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Kn).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(Kn).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(Ci[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),Ci[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),Ci[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),Ci[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),Ci[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),Ci[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),Ci[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),Ci[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(Ci),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}},Ci=[new O,new O,new O,new O,new O,new O,new O,new O],Kn=new O,gl=new ei,ps=new O,ms=new O,gs=new O,Ki=new O,Qi=new O,Ir=new O,To=new O,yl=new O,bl=new O,Lr=new O;function Bu(n,e,t,i,r){for(let s=0,o=n.length-3;s<=o;s+=3){Lr.fromArray(n,s);let a=r.x*Math.abs(Lr.x)+r.y*Math.abs(Lr.y)+r.z*Math.abs(Lr.z),l=e.dot(Lr),c=t.dot(Lr),h=i.dot(Lr);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>a)return!1}return!0}var Dt=new O,xl=new Pe,Ix=0,kt=class extends Qn{constructor(e,t,i=!1){if(super(),Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Ix++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=i,this.usage=Ad,this.updateRanges=[],this.gpuType=Nn,this.version=0,this._normalizationScale=e!==void 0?eh(e):void 0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this._normalizationScale=e._normalizationScale,this}copyAt(e,t,i){e*=this.itemSize,i*=t.itemSize;for(let r=0,s=this.itemSize;r<s;r++)this.array[e+r]=t.array[i+r];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,i=this.count;t<i;t++)xl.fromBufferAttribute(this,t),xl.applyMatrix3(e),this.setXY(t,xl.x,xl.y);else if(this.itemSize===3)for(let t=0,i=this.count;t<i;t++)Dt.fromBufferAttribute(this,t),Dt.applyMatrix3(e),this.setXYZ(t,Dt.x,Dt.y,Dt.z);return this}applyMatrix4(e){for(let t=0,i=this.count;t<i;t++)Dt.fromBufferAttribute(this,t),Dt.applyMatrix4(e),this.setXYZ(t,Dt.x,Dt.y,Dt.z);return this}applyNormalMatrix(e){for(let t=0,i=this.count;t<i;t++)Dt.fromBufferAttribute(this,t),Dt.applyNormalMatrix(e),this.setXYZ(t,Dt.x,Dt.y,Dt.z);return this}transformDirection(e){for(let t=0,i=this.count;t<i;t++)Dt.fromBufferAttribute(this,t),Dt.transformDirection(e),this.setXYZ(t,Dt.x,Dt.y,Dt.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let i=this.array[e*this.itemSize+t];return this.normalized&&(i=this._denormalize(i)),i}setComponent(e,t,i){return this.normalized&&(i=this._normalize(i)),this.array[e*this.itemSize+t]=i,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=this._denormalize(t)),t}setX(e,t){return this.normalized&&(t=this._normalize(t)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=this._denormalize(t)),t}setY(e,t){return this.normalized&&(t=this._normalize(t)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=this._denormalize(t)),t}setZ(e,t){return this.normalized&&(t=this._normalize(t)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=this._denormalize(t)),t}setW(e,t){return this.normalized&&(t=this._normalize(t)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,i){return e*=this.itemSize,this.normalized&&(t=this._normalize(t),i=this._normalize(i)),this.array[e+0]=t,this.array[e+1]=i,this}setXYZ(e,t,i,r){return e*=this.itemSize,this.normalized&&(t=this._normalize(t),i=this._normalize(i),r=this._normalize(r)),this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=r,this}setXYZW(e,t,i,r,s){return e*=this.itemSize,this.normalized&&(t=this._normalize(t),i=this._normalize(i),r=this._normalize(r),s=this._normalize(s)),this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=r,this.array[e+3]=s,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return e.name=this.name,e.usage=this.usage,e.gpuType=this.gpuType,e}dispose(){this.dispatchEvent({type:"dispose"})}_denormalize(e){let t=this._normalizationScale;return t!==void 0?Math.max(e/t,-1):Pd(e,this.array)}_normalize(e){let t=this._normalizationScale;return t!==void 0?Math.round(e*t):Id(e,this.array)}};var zo=class extends kt{constructor(e,t,i){super(new Uint16Array(e),t,i)}};var Ho=class extends kt{constructor(e,t,i){super(new Uint32Array(e),t,i)}};var Ut=class extends kt{constructor(e,t,i){super(new Float32Array(e),t,i)}},Lx=new ei,Ao=new O,zu=new O,ir=class{constructor(e=new O,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let i=this.center;t!==void 0?i.copy(t):Lx.setFromPoints(e).getCenter(i);let r=0;for(let s=0,o=e.length;s<o;s++)r=Math.max(r,i.distanceToSquared(e[s]));return this.radius=Math.sqrt(r),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let i=this.center.distanceToSquared(e);return t.copy(e),i>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;Ao.subVectors(e,this.center);let t=Ao.lengthSq();if(t>this.radius*this.radius){let i=Math.sqrt(t),r=(i-this.radius)*.5;this.center.addScaledVector(Ao,r/i),this.radius+=r}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(zu.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(Ao.copy(e.center).add(zu)),this.expandByPoint(Ao.copy(e.center).sub(zu))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}},Dx=0,Wn=new ft,Hu=new Yt,ys=new O,Tn=new ei,Ro=new ei,qt=new O,vt=class n extends Qn{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Dx++}),this.uuid=ur(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(rx(e)?Ho:zo)(e,1):this.index=e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,i=0){this.groups.push({start:e,count:t,materialIndex:i})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let i=this.attributes.normal;if(i!==void 0){let s=new Ue().getNormalMatrix(e);i.applyNormalMatrix(s),i.needsUpdate=!0}let r=this.attributes.tangent;return r!==void 0&&(r.transformDirection(e),r.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(e){return Wn.makeRotationFromQuaternion(e),this.applyMatrix4(Wn),this}rotateX(e){return Wn.makeRotationX(e),this.applyMatrix4(Wn),this}rotateY(e){return Wn.makeRotationY(e),this.applyMatrix4(Wn),this}rotateZ(e){return Wn.makeRotationZ(e),this.applyMatrix4(Wn),this}translate(e,t,i){return Wn.makeTranslation(e,t,i),this.applyMatrix4(Wn),this}scale(e,t,i){return Wn.makeScale(e,t,i),this.applyMatrix4(Wn),this}lookAt(e){return Hu.lookAt(e),Hu.updateMatrix(),this.applyMatrix4(Hu.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(ys).negate(),this.translate(ys.x,ys.y,ys.z),this}setFromPoints(e){let t=this.getAttribute("position");if(t===void 0){let i=[];for(let r=0,s=e.length;r<s;r++){let o=e[r];i.push(o.x,o.y,o.z||0)}this.setAttribute("position",new Ut(i,3))}else{let i=Math.min(e.length,t.count);for(let r=0;r<i;r++){let s=e[r];t.setXYZ(r,s.x,s.y,s.z||0)}e.length>t.count&&Ie("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new ei);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){Fe("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new O(-1/0,-1/0,-1/0),new O(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let i=0,r=t.length;i<r;i++){let s=t[i];Tn.setFromBufferAttribute(s),this.morphTargetsRelative?(qt.addVectors(this.boundingBox.min,Tn.min),this.boundingBox.expandByPoint(qt),qt.addVectors(this.boundingBox.max,Tn.max),this.boundingBox.expandByPoint(qt)):(this.boundingBox.expandByPoint(Tn.min),this.boundingBox.expandByPoint(Tn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&Fe('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new ir);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){Fe("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new O,1/0);return}if(e){let i=this.boundingSphere.center;if(Tn.setFromBufferAttribute(e),t)for(let s=0,o=t.length;s<o;s++){let a=t[s];Ro.setFromBufferAttribute(a),this.morphTargetsRelative?(qt.addVectors(Tn.min,Ro.min),Tn.expandByPoint(qt),qt.addVectors(Tn.max,Ro.max),Tn.expandByPoint(qt)):(Tn.expandByPoint(Ro.min),Tn.expandByPoint(Ro.max))}Tn.getCenter(i);let r=0;for(let s=0,o=e.count;s<o;s++)qt.fromBufferAttribute(e,s),r=Math.max(r,i.distanceToSquared(qt));if(t)for(let s=0,o=t.length;s<o;s++){let a=t[s],l=this.morphTargetsRelative;for(let c=0,h=a.count;c<h;c++)qt.fromBufferAttribute(a,c),l&&(ys.fromBufferAttribute(e,c),qt.add(ys)),r=Math.max(r,i.distanceToSquared(qt))}this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&Fe('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){Fe("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let i=t.position,r=t.normal,s=t.uv,o=this.getAttribute("tangent");(o===void 0||o.count!==i.count)&&(o=new kt(new Float32Array(4*i.count),4),this.setAttribute("tangent",o));let a=[],l=[],c=new Uint8Array(i.count);for(let L=0;L<i.count;L++)a[L]=new O,l[L]=new O;let h=new O,u=new O,f=new O,d=new Pe,p=new Pe,y=new Pe,m=new O,g=new O;function b(L,C,k){c[L]=c[C]=c[k]=1,h.fromBufferAttribute(i,L),u.fromBufferAttribute(i,C),f.fromBufferAttribute(i,k),d.fromBufferAttribute(s,L),p.fromBufferAttribute(s,C),y.fromBufferAttribute(s,k),u.sub(h),f.sub(h),p.sub(d),y.sub(d);let H=1/(p.x*y.y-y.x*p.y);isFinite(H)&&(m.copy(u).multiplyScalar(y.y).addScaledVector(f,-p.y).multiplyScalar(H),g.copy(f).multiplyScalar(p.x).addScaledVector(u,-y.x).multiplyScalar(H),a[L].add(m),a[C].add(m),a[k].add(m),l[L].add(g),l[C].add(g),l[k].add(g))}let _=this.groups;_.length===0&&(_=[{start:0,count:e.count}]);for(let L=0,C=_.length;L<C;++L){let k=_[L],H=k.start,j=k.count;for(let I=H,V=H+j;I<V;I+=3)b(e.getX(I+0),e.getX(I+1),e.getX(I+2))}let x=new O,M=new O,E=new O,v=new O;function A(L){E.fromBufferAttribute(r,L),v.copy(E);let C=a[L];x.copy(C),x.sub(E.multiplyScalar(E.dot(C))).normalize(),M.crossVectors(v,C);let H=M.dot(l[L])<0?-1:1;o.setXYZW(L,x.x,x.y,x.z,H)}for(let L=0,C=i.count;L<C;++L)c[L]&&A(L);this._transformed=!0}computeVertexNormals(){let e=this.index,t=this.getAttribute("position");if(t!==void 0){let i=this.getAttribute("normal");if(i===void 0||i.count!==t.count)i=new kt(new Float32Array(t.count*3),3),this.setAttribute("normal",i);else for(let f=0,d=i.count;f<d;f++)i.setXYZ(f,0,0,0);let r=new O,s=new O,o=new O,a=new O,l=new O,c=new O,h=new O,u=new O;if(e)for(let f=0,d=e.count;f<d;f+=3){let p=e.getX(f+0),y=e.getX(f+1),m=e.getX(f+2);r.fromBufferAttribute(t,p),s.fromBufferAttribute(t,y),o.fromBufferAttribute(t,m),h.subVectors(o,s),u.subVectors(r,s),h.cross(u),a.fromBufferAttribute(i,p),l.fromBufferAttribute(i,y),c.fromBufferAttribute(i,m),a.add(h),l.add(h),c.add(h),i.setXYZ(p,a.x,a.y,a.z),i.setXYZ(y,l.x,l.y,l.z),i.setXYZ(m,c.x,c.y,c.z)}else for(let f=0,d=t.count;f<d;f+=3)r.fromBufferAttribute(t,f+0),s.fromBufferAttribute(t,f+1),o.fromBufferAttribute(t,f+2),h.subVectors(o,s),u.subVectors(r,s),h.cross(u),i.setXYZ(f+0,h.x,h.y,h.z),i.setXYZ(f+1,h.x,h.y,h.z),i.setXYZ(f+2,h.x,h.y,h.z);this.normalizeNormals(),i.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,i=e.count;t<i;t++)qt.fromBufferAttribute(e,t),qt.normalize(),e.setXYZ(t,qt.x,qt.y,qt.z)}toNonIndexed(){function e(a,l){let c=a.array,h=a.itemSize,u=a.normalized,f=new c.constructor(l.length*h),d=0,p=0;for(let y=0,m=l.length;y<m;y++){a.isInterleavedBufferAttribute?d=l[y]*a.data.stride+a.offset:d=l[y]*h;for(let g=0;g<h;g++)f[p++]=c[d++]}return new kt(f,h,u)}if(this.index===null)return Ie("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let t=new n,i=this.index.array,r=this.attributes;for(let a in r){let l=r[a],c=e(l,i);t.setAttribute(a,c)}let s=this.morphAttributes;for(let a in s){let l=[],c=s[a];for(let h=0,u=c.length;h<u;h++){let f=c[h],d=e(f,i);l.push(d)}t.morphAttributes[a]=l}t.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let a=0,l=o.length;a<l;a++){let c=o[a];t.addGroup(c.start,c.count,c.materialIndex)}return t}toJSON(){let e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,e.name=this.name,Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){let l=this.parameters;for(let c in l)l[c]!==void 0&&(e[c]=l[c]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let i=this.attributes;for(let l in i){let c=i[l];e.data.attributes[l]=c.toJSON(e.data)}let r={},s=!1;for(let l in this.morphAttributes){let c=this.morphAttributes[l],h=[];for(let u=0,f=c.length;u<f;u++){let d=c[u];h.push(d.toJSON(e.data))}h.length>0&&(r[l]=h,s=!0)}s&&(e.data.morphAttributes=r,e.data.morphTargetsRelative=this.morphTargetsRelative);let o=this.groups;o.length>0&&(e.data.groups=JSON.parse(JSON.stringify(o)));let a=this.boundingSphere;return a!==null&&(e.data.boundingSphere=a.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let i=e.index;i!==null&&this.setIndex(i.clone());let r=e.attributes;for(let c in r){let h=r[c];this.setAttribute(c,h.clone(t))}let s=e.morphAttributes;for(let c in s){let h=[],u=s[c];for(let f=0,d=u.length;f<d;f++)h.push(u[f].clone(t));this.morphAttributes[c]=h}this.morphTargetsRelative=e.morphTargetsRelative;let o=e.groups;for(let c=0,h=o.length;c<h;c++){let u=o[c];this.addGroup(u.start,u.count,u.materialIndex)}let a=e.boundingBox;a!==null&&(this.boundingBox=a.clone());let l=e.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this._transformed=e._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}},Zl=class{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=Ad,this.updateRanges=[],this.version=0,this.uuid=ur()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,i){e*=this.stride,i*=t.stride;for(let r=0,s=this.stride;r<s;r++)this.array[e+r]=t.array[i+r];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={});let t=fm(this.array);e.arrayBuffers[t]===void 0&&(e.arrayBuffers[t]=this.array.slice(0).buffer);let i=new this.array.constructor(e.arrayBuffers[t]),r=new this.constructor(i,this.stride);return r.setUsage(this.usage),r}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){e.arrayBuffers===void 0&&(e.arrayBuffers={});let t=fm(this.array);e.arrayBuffers[t]===void 0&&(e.arrayBuffers[t]=Array.from(new Uint32Array(this.array.slice(0).buffer)));let i={uuid:this.uuid,buffer:t,type:this.array.constructor.name,stride:this.stride};return i.usage=this.usage,i}};function fm(n){return n.buffer._uuid===void 0&&(n.buffer._uuid=ur()),n.byteOffset===0&&n.byteLength===n.buffer.byteLength?n.buffer._uuid:n.buffer._uuid+":"+n.byteOffset+":"+n.byteLength}var dn=new O,Tt=class n{constructor(e,t,i,r=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=i,this.normalized=r,this._normalizationScale=e!==void 0?eh(e.array):void 0}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,i=this.data.count;t<i;t++)dn.fromBufferAttribute(this,t),dn.applyMatrix4(e),this.setXYZ(t,dn.x,dn.y,dn.z);return this}applyNormalMatrix(e){for(let t=0,i=this.count;t<i;t++)dn.fromBufferAttribute(this,t),dn.applyNormalMatrix(e),this.setXYZ(t,dn.x,dn.y,dn.z);return this}transformDirection(e){for(let t=0,i=this.count;t<i;t++)dn.fromBufferAttribute(this,t),dn.transformDirection(e),this.setXYZ(t,dn.x,dn.y,dn.z);return this}getComponent(e,t){let i=this.array[e*this.data.stride+this.offset+t];return this.normalized&&(i=this._denormalize(i)),i}setComponent(e,t,i){return this.normalized&&(i=this._normalize(i)),this.data.array[e*this.data.stride+this.offset+t]=i,this}setX(e,t){return this.normalized&&(t=this._normalize(t)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=this._normalize(t)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=this._normalize(t)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=this._normalize(t)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=this._denormalize(t)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=this._denormalize(t)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=this._denormalize(t)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=this._denormalize(t)),t}setXY(e,t,i){return e=e*this.data.stride+this.offset,this.normalized&&(t=this._normalize(t),i=this._normalize(i)),this.data.array[e+0]=t,this.data.array[e+1]=i,this}setXYZ(e,t,i,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=this._normalize(t),i=this._normalize(i),r=this._normalize(r)),this.data.array[e+0]=t,this.data.array[e+1]=i,this.data.array[e+2]=r,this}setXYZW(e,t,i,r,s){return e=e*this.data.stride+this.offset,this.normalized&&(t=this._normalize(t),i=this._normalize(i),r=this._normalize(r),s=this._normalize(s)),this.data.array[e+0]=t,this.data.array[e+1]=i,this.data.array[e+2]=r,this.data.array[e+3]=s,this}clone(e){if(e===void 0){Fo("InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let i=0;i<this.count;i++){let r=i*this.data.stride+this.offset;for(let s=0;s<this.itemSize;s++)t.push(this.data.array[r+s])}return new kt(new this.array.constructor(t),this.itemSize,this.normalized)}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.clone(e)),new n(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){Fo("InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let i=0;i<this.count;i++){let r=i*this.data.stride+this.offset;for(let s=0;s<this.itemSize;s++)t.push(this.data.array[r+s])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}_denormalize(e){let t=this._normalizationScale;return t!==void 0?Math.max(e/t,-1):Pd(e,this.data.array)}_normalize(e){let t=this._normalizationScale;return t!==void 0?Math.round(e*t):Id(e,this.data.array)}},Vu=new O,kx=new O,Nx=new Ue,Rn=class{constructor(e=new O(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,i,r){return this.normal.set(e,t,i),this.constant=r,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,i){let r=Vu.subVectors(i,t).cross(kx.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(r,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t,i=!0){let r=e.delta(Vu),s=this.normal.dot(r);if(s===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let o=-(e.start.dot(this.normal)+this.constant)/s;return i===!0&&(o<0||o>1)?null:t.copy(e.start).addScaledVector(r,o)}intersectsLine(e){let t=this.distanceToPoint(e.start),i=this.distanceToPoint(e.end);return t<0&&i>0||i<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let i=t||Nx.getNormalMatrix(e),r=this.coplanarPoint(Vu).applyMatrix4(e),s=this.normal.applyMatrix3(i).normalize();return this.constant=-r.dot(s),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}toJSON(){return{normal:this.normal.toArray(),constant:this.constant}}fromJSON(e){return this.normal.fromArray(e.normal),this.constant=e.constant,this}},Ox=0,Di=class extends Qn{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Ox++}),this.uuid=ur(),this.name="",this.type="Material",this.blending=Us,this.side=cr,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=id,this.blendDst=rd,this.blendEquation=Vr,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new je(0,0,0),this.blendAlpha=0,this.depthFunc=Ss,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=ng,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Nr,this.stencilZFail=Nr,this.stencilZPass=Nr,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let i=e[t];if(i===void 0){Ie(`Material: parameter '${t}' has value of undefined.`);continue}let r=this[t];if(r===void 0){Ie(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}r&&r.isColor?r.set(i):r&&r.isVector2&&i&&i.isVector2||r&&r.isEuler&&i&&i.isEuler||r&&r.isVector3&&i&&i.isVector3?r.copy(i):this[t]=i}}toJSON(e){let t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});let i={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};i.uuid=this.uuid,i.type=this.type,i.blending=this.blending,i.side=this.side,i.shadowSide=this.shadowSide,i.vertexColors=this.vertexColors,i.opacity=this.opacity,i.transparent=this.transparent,i.blendSrc=this.blendSrc,i.blendDst=this.blendDst,i.blendEquation=this.blendEquation,i.blendSrcAlpha=this.blendSrcAlpha,i.blendDstAlpha=this.blendDstAlpha,i.blendEquationAlpha=this.blendEquationAlpha,i.blendColor=this.blendColor.getHex(),i.blendAlpha=this.blendAlpha,i.depthFunc=this.depthFunc,i.depthTest=this.depthTest,i.depthWrite=this.depthWrite,i.colorWrite=this.colorWrite,i.clipIntersection=this.clipIntersection,i.clipShadows=this.clipShadows,i.stencilWriteMask=this.stencilWriteMask,i.stencilFunc=this.stencilFunc,i.stencilRef=this.stencilRef,i.stencilFuncMask=this.stencilFuncMask,i.stencilFail=this.stencilFail,i.stencilZFail=this.stencilZFail,i.stencilZPass=this.stencilZPass,i.stencilWrite=this.stencilWrite,i.polygonOffset=this.polygonOffset,i.polygonOffsetFactor=this.polygonOffsetFactor,i.polygonOffsetUnits=this.polygonOffsetUnits,i.dithering=this.dithering,i.alphaTest=this.alphaTest,i.alphaHash=this.alphaHash,i.alphaToCoverage=this.alphaToCoverage,i.premultipliedAlpha=this.premultipliedAlpha,i.forceSinglePass=this.forceSinglePass,i.allowOverride=this.allowOverride,i.visible=this.visible,i.toneMapped=this.toneMapped,i.name=this.name,this.color&&this.color.isColor&&(i.color=this.color.getHex()),this.roughness!==void 0&&(i.roughness=this.roughness),this.metalness!==void 0&&(i.metalness=this.metalness),this.sheen!==void 0&&(i.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(i.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(i.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(i.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&(i.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(i.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(i.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(i.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(i.shininess=this.shininess),this.clearcoat!==void 0&&(i.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(i.clearcoatRoughness=this.clearcoatRoughness),this.diffuseRoughness!==void 0&&(i.diffuseRoughness=this.diffuseRoughness),this.diffuseRoughnessMap&&this.diffuseRoughnessMap.isTexture&&(i.diffuseRoughnessMap=this.diffuseRoughnessMap.toJSON(e).uuid),this.clearcoatMap&&this.clearcoatMap.isTexture&&(i.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(i.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(i.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,i.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(i.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(i.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(i.dispersion=this.dispersion),this.retroreflectivity!==void 0&&(i.retroreflectivity=this.retroreflectivity),this.iridescence!==void 0&&(i.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(i.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessMinimum!==void 0&&(i.iridescenceThicknessMinimum=this.iridescenceThicknessMinimum),this.iridescenceThicknessMaximum!==void 0&&(i.iridescenceThicknessMaximum=this.iridescenceThicknessMaximum),this.iridescenceMap&&this.iridescenceMap.isTexture&&(i.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(i.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(i.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(i.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(i.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(i.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(i.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(i.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(i.lightMap=this.lightMap.toJSON(e).uuid,i.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(i.aoMap=this.aoMap.toJSON(e).uuid,i.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(i.bumpMap=this.bumpMap.toJSON(e).uuid,i.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(i.normalMap=this.normalMap.toJSON(e).uuid,i.normalMapType=this.normalMapType,i.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(i.displacementMap=this.displacementMap.toJSON(e).uuid,i.displacementScale=this.displacementScale,i.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(i.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(i.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(i.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(i.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(i.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(i.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(i.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(i.combine=this.combine)),this.envMapRotation!==void 0&&(i.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(i.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(i.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(i.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(i.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(i.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(i.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(i.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(i.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&(i.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(i.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(i.size=this.size),this.sizeAttenuation!==void 0&&(i.sizeAttenuation=this.sizeAttenuation),Array.isArray(this.clippingPlanes)&&this.clippingPlanes.length>0&&(i.clippingPlanes=this.clippingPlanes.map(s=>s.toJSON())),this.rotation!==void 0&&(i.rotation=this.rotation),this.depthPacking!==void 0&&(i.depthPacking=this.depthPacking),this.linewidth!==void 0&&(i.linewidth=this.linewidth),this.linecap!==void 0&&(i.linecap=this.linecap),this.linejoin!==void 0&&(i.linejoin=this.linejoin),this.dashSize!==void 0&&(i.dashSize=this.dashSize),this.gapSize!==void 0&&(i.gapSize=this.gapSize),this.scale!==void 0&&(i.scale=this.scale),this.wireframe!==void 0&&(i.wireframe=this.wireframe),this.wireframeLinewidth!==void 0&&(i.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==void 0&&(i.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==void 0&&(i.wireframeLinejoin=this.wireframeLinejoin),this.flatShading!==void 0&&(i.flatShading=this.flatShading),this.fog!==void 0&&(i.fog=this.fog),Object.keys(this.userData).length>0&&(i.userData=this.userData);function r(s){let o=[];for(let a in s){let l=s[a];delete l.metadata,o.push(l)}return o}if(t){let s=r(e.textures),o=r(e.images);s.length>0&&(i.textures=s),o.length>0&&(i.images=o)}return i}fromJSON(e,t){if(e.uuid!==void 0&&(this.uuid=e.uuid),e.name!==void 0&&(this.name=e.name),e.color!==void 0&&this.color!==void 0&&this.color.setHex(e.color),e.roughness!==void 0&&(this.roughness=e.roughness),e.metalness!==void 0&&(this.metalness=e.metalness),e.sheen!==void 0&&(this.sheen=e.sheen),e.sheenColor!==void 0&&(this.sheenColor=new je().setHex(e.sheenColor)),e.sheenRoughness!==void 0&&(this.sheenRoughness=e.sheenRoughness),e.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(e.emissive),e.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(e.specular),e.specularIntensity!==void 0&&(this.specularIntensity=e.specularIntensity),e.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(e.specularColor),e.shininess!==void 0&&(this.shininess=e.shininess),e.clearcoat!==void 0&&(this.clearcoat=e.clearcoat),e.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=e.clearcoatRoughness),e.diffuseRoughness!==void 0&&(this.diffuseRoughness=e.diffuseRoughness),e.dispersion!==void 0&&(this.dispersion=e.dispersion),e.retroreflectivity!==void 0&&(this.retroreflectivity=e.retroreflectivity),e.iridescence!==void 0&&(this.iridescence=e.iridescence),e.iridescenceIOR!==void 0&&(this.iridescenceIOR=e.iridescenceIOR),e.iridescenceThicknessMinimum!==void 0&&(this.iridescenceThicknessMinimum=e.iridescenceThicknessMinimum),e.iridescenceThicknessMaximum!==void 0&&(this.iridescenceThicknessMaximum=e.iridescenceThicknessMaximum),e.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessMinimum=e.iridescenceThicknessRange[0],this.iridescenceThicknessMaximum=e.iridescenceThicknessRange[1]),e.transmission!==void 0&&(this.transmission=e.transmission),e.thickness!==void 0&&(this.thickness=e.thickness),e.attenuationDistance!==void 0&&(this.attenuationDistance=e.attenuationDistance),e.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(e.attenuationColor),e.anisotropy!==void 0&&(this.anisotropy=e.anisotropy),e.anisotropyRotation!==void 0&&(this.anisotropyRotation=e.anisotropyRotation),e.fog!==void 0&&(this.fog=e.fog),e.flatShading!==void 0&&(this.flatShading=e.flatShading),e.blending!==void 0&&(this.blending=e.blending),e.combine!==void 0&&(this.combine=e.combine),e.side!==void 0&&(this.side=e.side),e.shadowSide!==void 0&&(this.shadowSide=e.shadowSide),e.opacity!==void 0&&(this.opacity=e.opacity),e.transparent!==void 0&&(this.transparent=e.transparent),e.alphaTest!==void 0&&(this.alphaTest=e.alphaTest),e.alphaHash!==void 0&&(this.alphaHash=e.alphaHash),e.depthFunc!==void 0&&(this.depthFunc=e.depthFunc),e.depthTest!==void 0&&(this.depthTest=e.depthTest),e.depthWrite!==void 0&&(this.depthWrite=e.depthWrite),e.colorWrite!==void 0&&(this.colorWrite=e.colorWrite),e.clippingPlanes!==void 0&&(this.clippingPlanes=e.clippingPlanes.map(i=>new Rn().fromJSON(i))),e.clipIntersection!==void 0&&(this.clipIntersection=e.clipIntersection),e.clipShadows!==void 0&&(this.clipShadows=e.clipShadows),e.depthPacking!==void 0&&(this.depthPacking=e.depthPacking),e.blendSrc!==void 0&&(this.blendSrc=e.blendSrc),e.blendDst!==void 0&&(this.blendDst=e.blendDst),e.blendEquation!==void 0&&(this.blendEquation=e.blendEquation),e.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=e.blendSrcAlpha),e.blendDstAlpha!==void 0&&(this.blendDstAlpha=e.blendDstAlpha),e.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=e.blendEquationAlpha),e.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(e.blendColor),e.blendAlpha!==void 0&&(this.blendAlpha=e.blendAlpha),e.stencilWriteMask!==void 0&&(this.stencilWriteMask=e.stencilWriteMask),e.stencilFunc!==void 0&&(this.stencilFunc=e.stencilFunc),e.stencilRef!==void 0&&(this.stencilRef=e.stencilRef),e.stencilFuncMask!==void 0&&(this.stencilFuncMask=e.stencilFuncMask),e.stencilFail!==void 0&&(this.stencilFail=e.stencilFail),e.stencilZFail!==void 0&&(this.stencilZFail=e.stencilZFail),e.stencilZPass!==void 0&&(this.stencilZPass=e.stencilZPass),e.stencilWrite!==void 0&&(this.stencilWrite=e.stencilWrite),e.wireframe!==void 0&&(this.wireframe=e.wireframe),e.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=e.wireframeLinewidth),e.wireframeLinecap!==void 0&&(this.wireframeLinecap=e.wireframeLinecap),e.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=e.wireframeLinejoin),e.rotation!==void 0&&(this.rotation=e.rotation),e.linewidth!==void 0&&(this.linewidth=e.linewidth),e.linecap!==void 0&&(this.linecap=e.linecap),e.linejoin!==void 0&&(this.linejoin=e.linejoin),e.dashSize!==void 0&&(this.dashSize=e.dashSize),e.gapSize!==void 0&&(this.gapSize=e.gapSize),e.scale!==void 0&&(this.scale=e.scale),e.polygonOffset!==void 0&&(this.polygonOffset=e.polygonOffset),e.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=e.polygonOffsetFactor),e.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=e.polygonOffsetUnits),e.dithering!==void 0&&(this.dithering=e.dithering),e.alphaToCoverage!==void 0&&(this.alphaToCoverage=e.alphaToCoverage),e.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=e.premultipliedAlpha),e.forceSinglePass!==void 0&&(this.forceSinglePass=e.forceSinglePass),e.allowOverride!==void 0&&(this.allowOverride=e.allowOverride),e.visible!==void 0&&(this.visible=e.visible),e.toneMapped!==void 0&&(this.toneMapped=e.toneMapped),e.userData!==void 0&&(this.userData=e.userData),e.vertexColors!==void 0&&(typeof e.vertexColors=="number"?this.vertexColors=e.vertexColors>0:this.vertexColors=e.vertexColors),e.size!==void 0&&(this.size=e.size),e.sizeAttenuation!==void 0&&(this.sizeAttenuation=e.sizeAttenuation),e.map!==void 0&&(this.map=t[e.map]||null),e.matcap!==void 0&&(this.matcap=t[e.matcap]||null),e.alphaMap!==void 0&&(this.alphaMap=t[e.alphaMap]||null),e.bumpMap!==void 0&&(this.bumpMap=t[e.bumpMap]||null),e.bumpScale!==void 0&&(this.bumpScale=e.bumpScale),e.normalMap!==void 0&&(this.normalMap=t[e.normalMap]||null),e.normalMapType!==void 0&&(this.normalMapType=e.normalMapType),e.normalScale!==void 0){let i=e.normalScale;Array.isArray(i)===!1&&(i=[i,i]),this.normalScale=new Pe().fromArray(i)}return e.displacementMap!==void 0&&(this.displacementMap=t[e.displacementMap]||null),e.displacementScale!==void 0&&(this.displacementScale=e.displacementScale),e.displacementBias!==void 0&&(this.displacementBias=e.displacementBias),e.roughnessMap!==void 0&&(this.roughnessMap=t[e.roughnessMap]||null),e.metalnessMap!==void 0&&(this.metalnessMap=t[e.metalnessMap]||null),e.emissiveMap!==void 0&&(this.emissiveMap=t[e.emissiveMap]||null),e.emissiveIntensity!==void 0&&(this.emissiveIntensity=e.emissiveIntensity),e.specularMap!==void 0&&(this.specularMap=t[e.specularMap]||null),e.specularIntensityMap!==void 0&&(this.specularIntensityMap=t[e.specularIntensityMap]||null),e.specularColorMap!==void 0&&(this.specularColorMap=t[e.specularColorMap]||null),e.envMap!==void 0&&(this.envMap=t[e.envMap]||null),e.envMapRotation!==void 0&&this.envMapRotation.fromArray(e.envMapRotation),e.envMapIntensity!==void 0&&(this.envMapIntensity=e.envMapIntensity),e.reflectivity!==void 0&&(this.reflectivity=e.reflectivity),e.refractionRatio!==void 0&&(this.refractionRatio=e.refractionRatio),e.lightMap!==void 0&&(this.lightMap=t[e.lightMap]||null),e.lightMapIntensity!==void 0&&(this.lightMapIntensity=e.lightMapIntensity),e.aoMap!==void 0&&(this.aoMap=t[e.aoMap]||null),e.aoMapIntensity!==void 0&&(this.aoMapIntensity=e.aoMapIntensity),e.gradientMap!==void 0&&(this.gradientMap=t[e.gradientMap]||null),e.clearcoatMap!==void 0&&(this.clearcoatMap=t[e.clearcoatMap]||null),e.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=t[e.clearcoatRoughnessMap]||null),e.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=t[e.clearcoatNormalMap]||null),e.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new Pe().fromArray(e.clearcoatNormalScale)),e.diffuseRoughnessMap!==void 0&&(this.diffuseRoughnessMap=t[e.diffuseRoughnessMap]||null),e.iridescenceMap!==void 0&&(this.iridescenceMap=t[e.iridescenceMap]||null),e.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=t[e.iridescenceThicknessMap]||null),e.transmissionMap!==void 0&&(this.transmissionMap=t[e.transmissionMap]||null),e.thicknessMap!==void 0&&(this.thicknessMap=t[e.thicknessMap]||null),e.anisotropyMap!==void 0&&(this.anisotropyMap=t[e.anisotropyMap]||null),e.sheenColorMap!==void 0&&(this.sheenColorMap=t[e.sheenColorMap]||null),e.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=t[e.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,i=null;if(t!==null){let r=t.length;i=new Array(r);for(let s=0;s!==r;++s)i[s]=t[s].clone()}return this.clippingPlanes=i,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}};var Pi=new O,Gu=new O,vl=new O,_l=new O,rr=class{constructor(e=new O,t=new O(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,Pi)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let i=t.dot(this.direction);return i<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,i)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=Pi.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(Pi.copy(this.origin).addScaledVector(this.direction,t),Pi.distanceToSquared(e))}distanceSqToSegment(e,t,i,r){Gu.copy(e).add(t).multiplyScalar(.5),vl.copy(t).sub(e).normalize(),_l.copy(this.origin).sub(Gu);let s=e.distanceTo(t)*.5,o=-this.direction.dot(vl),a=_l.dot(this.direction),l=-_l.dot(vl),c=_l.lengthSq(),h=Math.abs(1-o*o),u,f,d,p;if(h>0)if(u=o*l-a,f=o*a-l,p=s*h,u>=0)if(f>=-p)if(f<=p){let y=1/h;u*=y,f*=y,d=u*(u+o*f+2*a)+f*(o*u+f+2*l)+c}else f=s,u=Math.max(0,-(o*f+a)),d=-u*u+f*(f+2*l)+c;else f=-s,u=Math.max(0,-(o*f+a)),d=-u*u+f*(f+2*l)+c;else f<=-p?(u=Math.max(0,-(-o*s+a)),f=u>0?-s:Math.min(Math.max(-s,-l),s),d=-u*u+f*(f+2*l)+c):f<=p?(u=0,f=Math.min(Math.max(-s,-l),s),d=f*(f+2*l)+c):(u=Math.max(0,-(o*s+a)),f=u>0?s:Math.min(Math.max(-s,-l),s),d=-u*u+f*(f+2*l)+c);else f=o>0?-s:s,u=Math.max(0,-(o*f+a)),d=-u*u+f*(f+2*l)+c;return i&&i.copy(this.origin).addScaledVector(this.direction,u),r&&r.copy(Gu).addScaledVector(vl,f),d}intersectSphere(e,t){if(e.radius<0)return null;Pi.subVectors(e.center,this.origin);let i=Pi.dot(this.direction),r=Pi.dot(Pi)-i*i,s=e.radius*e.radius;if(r>s)return null;let o=Math.sqrt(s-r),a=i-o,l=i+o;return l<0?null:a<0?this.at(l,t):this.at(a,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let i=-(this.origin.dot(e.normal)+e.constant)/t;return i>=0?i:null}intersectPlane(e,t){let i=this.distanceToPlane(e);return i===null?null:this.at(i,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let i,r,s,o,a,l,c=1/this.direction.x,h=1/this.direction.y,u=1/this.direction.z,f=this.origin;return c>=0?(i=(e.min.x-f.x)*c,r=(e.max.x-f.x)*c):(i=(e.max.x-f.x)*c,r=(e.min.x-f.x)*c),h>=0?(s=(e.min.y-f.y)*h,o=(e.max.y-f.y)*h):(s=(e.max.y-f.y)*h,o=(e.min.y-f.y)*h),i>o||s>r||((s>i||isNaN(i))&&(i=s),(o<r||isNaN(r))&&(r=o),u>=0?(a=(e.min.z-f.z)*u,l=(e.max.z-f.z)*u):(a=(e.max.z-f.z)*u,l=(e.min.z-f.z)*u),i>l||a>r)||((a>i||i!==i)&&(i=a),(l<r||r!==r)&&(r=l),r<0)?null:this.at(i>=0?i:r,t)}intersectsBox(e){return this.intersectBox(e,Pi)!==null}intersectTriangle(e,t,i,r,s){let o=this.origin,a=this.direction,l=a.x,c=a.y,h=a.z,u=e.x-o.x,f=e.y-o.y,d=e.z-o.z,p=t.x-o.x,y=t.y-o.y,m=t.z-o.z,g=i.x-o.x,b=i.y-o.y,_=i.z-o.z,x=Math.abs(l),M=Math.abs(c),E=Math.abs(h),v,A,L,C,k,H,j,I,V,G,W,te;if(x>=M&&x>=E?(L=l,H=u,V=p,te=g,l>=0?(v=c,A=h,C=f,k=d,j=y,I=m,G=b,W=_):(v=h,A=c,C=d,k=f,j=m,I=y,G=_,W=b)):M>=E?(L=c,H=f,V=y,te=b,c>=0?(v=h,A=l,C=d,k=u,j=m,I=p,G=_,W=g):(v=l,A=h,C=u,k=d,j=p,I=m,G=g,W=_)):(L=h,H=d,V=m,te=_,h>=0?(v=l,A=c,C=u,k=f,j=p,I=y,G=g,W=b):(v=c,A=l,C=f,k=u,j=y,I=p,G=b,W=g)),L===0)return null;let X=v/L,ee=A/L,ne=1/L,be=C-X*H,ke=k-ee*H,J=j-X*V,me=I-ee*V,Me=G-X*te,Le=W-ee*te,xe=Me*me-Le*J,He=be*Le-ke*Me,At=J*ke-me*be;if(r){if(xe<0||He<0||At<0)return null}else if((xe<0||He<0||At<0)&&(xe>0||He>0||At>0))return null;let Ne=xe+He+At;if(Ne===0)return null;let lt=ne*(xe*H+He*V+At*te);return(Ne>0?lt<0:lt>0)?null:this.at(lt/Ne,s)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},As=class extends Di{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new je(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new nr,this.combine=sd,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}},pm=new ft,Dr=new rr,Sl=new ir,mm=new O,Ml=new O,wl=new O,El=new O,Wu=new O,Tl=new O,gm=new O,Al=new O,Jt=class extends Yt{constructor(e=new vt,t=new As){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0?this.morphTargetInfluences=e.morphTargetInfluences.slice():this.morphTargetInfluences=void 0,e.morphTargetDictionary!==void 0?this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary):this.morphTargetDictionary=void 0,this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let t=this.geometry.morphAttributes,i=Object.keys(t);if(i.length>0){let r=t[i[0]];if(r!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let s=0,o=r.length;s<o;s++){let a=r[s].name||String(s);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=s}}}}getVertexPosition(e,t){let i=this.geometry,r=i.attributes.position,s=i.morphAttributes.position,o=i.morphTargetsRelative;t.fromBufferAttribute(r,e);let a=this.morphTargetInfluences;if(s&&a){Tl.set(0,0,0);for(let l=0,c=s.length;l<c;l++){let h=a[l],u=s[l];h!==0&&(Wu.fromBufferAttribute(u,e),o?Tl.addScaledVector(Wu,h):Tl.addScaledVector(Wu.sub(t),h))}t.add(Tl)}return t}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let i=this.geometry,r=this.material,s=this.matrixWorld;r!==void 0&&(i.boundingSphere===null&&i.computeBoundingSphere(),Sl.copy(i.boundingSphere),Sl.applyMatrix4(s),Dr.copy(e.ray).recast(e.near),!(Sl.containsPoint(Dr.origin)===!1&&(Dr.intersectSphere(Sl,mm)===null||Dr.origin.distanceToSquared(mm)>(e.far-e.near)**2))&&(pm.copy(s).invert(),Dr.copy(e.ray).applyMatrix4(pm),!(i.boundingBox!==null&&Dr.intersectsBox(i.boundingBox)===!1)&&this._computeIntersections(e,t,Dr)))}_computeIntersections(e,t,i){let r,s=this.geometry,o=this.material,a=s.index,l=s.attributes.position,c=s.attributes.uv,h=s.attributes.uv1,u=s.attributes.normal,f=s.groups,d=s.drawRange;if(a!==null)if(Array.isArray(o))for(let p=0,y=f.length;p<y;p++){let m=f[p],g=o[m.materialIndex],b=Math.max(m.start,d.start),_=Math.min(a.count,Math.min(m.start+m.count,d.start+d.count));for(let x=b,M=_;x<M;x+=3){let E=a.getX(x),v=a.getX(x+1),A=a.getX(x+2);r=Rl(this,g,e,i,c,h,u,E,v,A),r&&(r.faceIndex=Math.floor(x/3),r.face.materialIndex=m.materialIndex,t.push(r))}}else{let p=Math.max(0,d.start),y=Math.min(a.count,d.start+d.count);for(let m=p,g=y;m<g;m+=3){let b=a.getX(m),_=a.getX(m+1),x=a.getX(m+2);r=Rl(this,o,e,i,c,h,u,b,_,x),r&&(r.faceIndex=Math.floor(m/3),t.push(r))}}else if(l!==void 0)if(Array.isArray(o))for(let p=0,y=f.length;p<y;p++){let m=f[p],g=o[m.materialIndex],b=Math.max(m.start,d.start),_=Math.min(l.count,Math.min(m.start+m.count,d.start+d.count));for(let x=b,M=_;x<M;x+=3){let E=x,v=x+1,A=x+2;r=Rl(this,g,e,i,c,h,u,E,v,A),r&&(r.faceIndex=Math.floor(x/3),r.face.materialIndex=m.materialIndex,t.push(r))}}else{let p=Math.max(0,d.start),y=Math.min(l.count,d.start+d.count);for(let m=p,g=y;m<g;m+=3){let b=m,_=m+1,x=m+2;r=Rl(this,o,e,i,c,h,u,b,_,x),r&&(r.faceIndex=Math.floor(m/3),t.push(r))}}}};function Fx(n,e,t,i,r,s,o,a){let l;if(e.side===gn?l=i.intersectTriangle(o,s,r,!0,a):l=i.intersectTriangle(r,s,o,e.side===cr,a),l===null)return null;Al.copy(a),Al.applyMatrix4(n.matrixWorld);let c=t.ray.origin.distanceTo(Al);return c<t.near||c>t.far?null:{distance:c,point:Al.clone(),object:n}}function Rl(n,e,t,i,r,s,o,a,l,c){n.getVertexPosition(a,Ml),n.getVertexPosition(l,wl),n.getVertexPosition(c,El);let h=Fx(n,e,t,i,Ml,wl,El,gm);if(h){let u=new O;tr.getBarycoord(gm,Ml,wl,El,u),r&&(h.uv=tr.getInterpolatedAttribute(r,a,l,c,u,new Pe)),s&&(h.uv1=tr.getInterpolatedAttribute(s,a,l,c,u,new Pe)),o&&(h.normal=tr.getInterpolatedAttribute(o,a,l,c,u,new O),h.normal.dot(i.direction)>0&&h.normal.multiplyScalar(-1));let f={a,b:l,c,normal:new O,materialIndex:0};tr.getNormal(Ml,wl,El,f.normal),h.face=f,h.barycoord=u}return h}var Rs=class extends tn{constructor(e=null,t=1,i=1,r,s,o,a,l,c=xt,h=xt,u,f){super(null,o,a,l,c,h,r,s,u,f),this.isDataTexture=!0,this.image={data:e,width:t,height:i},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var kr=new ir,Ux=new Pe(.5,.5),Cl=new O,Ur=class{constructor(e=new Rn,t=new Rn,i=new Rn,r=new Rn,s=new Rn,o=new Rn){this.planes=[e,t,i,r,s,o]}set(e,t,i,r,s,o){let a=this.planes;return a[0].copy(e),a[1].copy(t),a[2].copy(i),a[3].copy(r),a[4].copy(s),a[5].copy(o),this}copy(e){let t=this.planes;for(let i=0;i<6;i++)t[i].copy(e.planes[i]);return this}setFromProjectionMatrix(e,t=$n,i=!1){let r=this.planes,s=e.elements,o=s[0],a=s[1],l=s[2],c=s[3],h=s[4],u=s[5],f=s[6],d=s[7],p=s[8],y=s[9],m=s[10],g=s[11],b=s[12],_=s[13],x=s[14],M=s[15];if(r[0].setComponents(c-o,d-h,g-p,M-b).normalize(),r[1].setComponents(c+o,d+h,g+p,M+b).normalize(),r[2].setComponents(c+a,d+u,g+y,M+_).normalize(),r[3].setComponents(c-a,d-u,g-y,M-_).normalize(),i)r[4].setComponents(l,f,m,x).normalize(),r[5].setComponents(c-l,d-f,g-m,M-x).normalize();else if(r[4].setComponents(c-l,d-f,g-m,M-x).normalize(),t===$n)r[5].setComponents(c+l,d+f,g+m,M+x).normalize();else if(t===No)r[5].setComponents(l,f,m,x).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),kr.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),kr.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(kr)}intersectsSprite(e){kr.center.set(0,0,0);let t=Ux.distanceTo(e.center);return kr.radius=.7071067811865476+t,kr.applyMatrix4(e.matrixWorld),this.intersectsSphere(kr)}intersectsSphere(e){let t=this.planes,i=e.center,r=-e.radius;for(let s=0;s<6;s++)if(t[s].distanceToPoint(i)<r)return!1;return!0}intersectsBox(e){let t=this.planes;for(let i=0;i<6;i++){let r=t[i];if(Cl.x=r.normal.x>0?e.max.x:e.min.x,Cl.y=r.normal.y>0?e.max.y:e.min.y,Cl.z=r.normal.z>0?e.max.z:e.min.z,r.distanceToPoint(Cl)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let i=0;i<6;i++)if(t[i].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}},ym=new ft,Kl=class n{constructor(){this.coordinateSystem=$n,this._frustums=[],this._count=0}setFromArrayCamera(e){let t=e.cameras,i=this._frustums;for(let r=0;r<t.length;r++){let s=t[r];ym.multiplyMatrices(s.projectionMatrix,s.matrixWorldInverse),i[r]===void 0&&(i[r]=new Ur),i[r].setFromProjectionMatrix(ym,s.coordinateSystem,s.reversedDepth)}return this._count=t.length,this}getFrustum(e){return this._frustums[e]}intersectsObject(e){let t=this._frustums;for(let i=0;i<this._count;i++)if(t[i].intersectsObject(e))return!0;return!1}intersectsSprite(e){let t=this._frustums;for(let i=0;i<this._count;i++)if(t[i].intersectsSprite(e))return!0;return!1}intersectsSphere(e){let t=this._frustums;for(let i=0;i<this._count;i++)if(t[i].intersectsSphere(e))return!0;return!1}intersectsBox(e){let t=this._frustums;for(let i=0;i<this._count;i++)if(t[i].intersectsBox(e))return!0;return!1}containsPoint(e){let t=this._frustums;for(let i=0;i<this._count;i++)if(t[i].containsPoint(e))return!0;return!1}copy(e){this.coordinateSystem=e.coordinateSystem;let t=this._frustums,i=e._frustums;for(let r=0;r<e._count;r++)t[r]===void 0&&(t[r]=new Ur),t[r].copy(i[r]);return this._count=e._count,this}clone(){return new n().copy(this)}};var Br=class extends Di{constructor(e){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new je(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}},Ql=new O,ec=new O,bm=new ft,Co=new rr,Pl=new ir,$u=new O,xm=new O,Cs=class extends Yt{constructor(e=new vt,t=new Br){super(),this.isLine=!0,this.type="Line",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0?this.morphTargetInfluences=e.morphTargetInfluences.slice():this.morphTargetInfluences=void 0,e.morphTargetDictionary!==void 0?this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary):this.morphTargetDictionary=void 0,this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,i=[0];for(let r=1,s=t.count;r<s;r++)Ql.fromBufferAttribute(t,r-1),ec.fromBufferAttribute(t,r),i[r]=i[r-1],i[r]+=Ql.distanceTo(ec);e.setAttribute("lineDistance",new Ut(i,1))}else Ie("Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let i=this.geometry,r=this.matrixWorld,s=e.params.Line.threshold,o=i.drawRange;if(i.boundingSphere===null&&i.computeBoundingSphere(),Pl.copy(i.boundingSphere),Pl.applyMatrix4(r),Pl.radius+=s,e.ray.intersectsSphere(Pl)===!1)return;bm.copy(r).invert(),Co.copy(e.ray).applyMatrix4(bm);let a=s/((this.scale.x+this.scale.y+this.scale.z)/3),l=a*a,c=this.isLineSegments?2:1,h=i.index,f=i.attributes.position;if(h!==null){let d=Math.max(0,o.start),p=Math.min(h.count,o.start+o.count);for(let y=d,m=p-1;y<m;y+=c){let g=h.getX(y),b=h.getX(y+1),_=Il(this,e,Co,l,g,b,y);_&&t.push(_)}if(this.isLineLoop){let y=h.getX(p-1),m=h.getX(d),g=Il(this,e,Co,l,y,m,p-1);g&&t.push(g)}}else{let d=Math.max(0,o.start),p=Math.min(f.count,o.start+o.count);for(let y=d,m=p-1;y<m;y+=c){let g=Il(this,e,Co,l,y,y+1,y);g&&t.push(g)}if(this.isLineLoop){let y=Il(this,e,Co,l,p-1,d,p-1);y&&t.push(y)}}}updateMorphTargets(){let t=this.geometry.morphAttributes,i=Object.keys(t);if(i.length>0){let r=t[i[0]];if(r!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let s=0,o=r.length;s<o;s++){let a=r[s].name||String(s);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=s}}}}};function Il(n,e,t,i,r,s,o){let a=n.geometry.attributes.position;if(Ql.fromBufferAttribute(a,r),ec.fromBufferAttribute(a,s),t.distanceSqToSegment(Ql,ec,$u,xm)>i)return;$u.applyMatrix4(n.matrixWorld);let c=e.ray.origin.distanceTo($u);if(!(c<e.near||c>e.far))return{distance:c,point:xm.clone().applyMatrix4(n.matrixWorld),index:o,face:null,faceIndex:null,barycoord:null,object:n}}var vm=new O,_m=new O,Ps=class extends Cs{constructor(e,t){super(e,t),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,i=[];for(let r=0,s=t.count;r<s;r+=2)vm.fromBufferAttribute(t,r),_m.fromBufferAttribute(t,r+1),i[r]=r===0?0:i[r-1],i[r+1]=i[r]+vm.distanceTo(_m);e.setAttribute("lineDistance",new Ut(i,1))}else Ie("LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}};var zr=class extends Di{constructor(e){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new je(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},Sm=new ft,Ju=new rr,Ll=new ir,Dl=new O,Is=class extends Yt{constructor(e=new vt,t=new zr){super(),this.isPoints=!0,this.type="Points",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0?this.morphTargetInfluences=e.morphTargetInfluences.slice():this.morphTargetInfluences=void 0,e.morphTargetDictionary!==void 0?this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary):this.morphTargetDictionary=void 0,this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let i=this.geometry,r=this.matrixWorld,s=e.params.Points.threshold,o=i.drawRange;if(i.boundingSphere===null&&i.computeBoundingSphere(),Ll.copy(i.boundingSphere),Ll.applyMatrix4(r),Ll.radius+=s,e.ray.intersectsSphere(Ll)===!1)return;Sm.copy(r).invert(),Ju.copy(e.ray).applyMatrix4(Sm);let a=s/((this.scale.x+this.scale.y+this.scale.z)/3),l=a*a,c=i.index,u=i.attributes.position;if(c!==null){let f=Math.max(0,o.start),d=Math.min(c.count,o.start+o.count);for(let p=f,y=d;p<y;p++){let m=c.getX(p);Dl.fromBufferAttribute(u,m),Mm(Dl,m,l,r,e,t,this)}}else{let f=Math.max(0,o.start),d=Math.min(u.count,o.start+o.count);for(let p=f,y=d;p<y;p++)Dl.fromBufferAttribute(u,p),Mm(Dl,p,l,r,e,t,this)}}updateMorphTargets(){let t=this.geometry.morphAttributes,i=Object.keys(t);if(i.length>0){let r=t[i[0]];if(r!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let s=0,o=r.length;s<o;s++){let a=r[s].name||String(s);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=s}}}}};function Mm(n,e,t,i,r,s,o){let a=Ju.distanceSqToPoint(n);if(a<t){let l=new O;Ju.closestPointToPoint(n,l),l.applyMatrix4(i);let c=r.ray.origin.distanceTo(l);if(c<r.near||c>r.far)return;s.push({distance:c,distanceToRay:Math.sqrt(a),point:l,index:e,face:null,faceIndex:null,barycoord:null,object:o})}}var Vo=class extends tn{constructor(e=[],t=Gr,i,r,s,o,a,l,c,h){super(e,t,i,r,s,o,a,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}},Ls=class extends tn{constructor(e,t,i,r,s,o,a,l,c){super(e,t,i,r,s,o,a,l,c),this.isCanvasTexture=!0,this.needsUpdate=!0}};var ki=class extends tn{constructor(e,t,i=ni,r,s,o,a=xt,l=xt,c,h=Li,u=1){if(h!==Li&&h!==Fi)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");let f={width:e,height:t,depth:u};super(f,r,s,o,a,l,h,i,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new Es(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return t.compareFunction=this.compareFunction,t}},Go=class extends ki{constructor(e,t=ni,i=Gr,r,s,o=xt,a=xt,l,c=Li){let h={width:e,height:e,depth:1},u=[h,h,h,h,h,h];super(e,e,t,i,r,s,o,a,l,c),this.image=u,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}},Wo=class extends tn{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}},Ds=class n extends vt{constructor(e=1,t=1,i=1,r=1,s=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:i,widthSegments:r,heightSegments:s,depthSegments:o};let a=this;r=Math.floor(r),s=Math.floor(s),o=Math.floor(o);let l=[],c=[],h=[],u=[],f=0,d=0;p("z","y","x",-1,-1,i,t,e,o,s,0),p("z","y","x",1,-1,i,t,-e,o,s,1),p("x","z","y",1,1,e,i,t,r,o,2),p("x","z","y",1,-1,e,i,-t,r,o,3),p("x","y","z",1,-1,e,t,i,r,s,4),p("x","y","z",-1,-1,e,t,-i,r,s,5),this.setIndex(l),this.setAttribute("position",new Ut(c,3)),this.setAttribute("normal",new Ut(h,3)),this.setAttribute("uv",new Ut(u,2));function p(y,m,g,b,_,x,M,E,v,A,L){let C=x/v,k=M/A,H=x/2,j=M/2,I=E/2,V=v+1,G=A+1,W=0,te=0,X=new O;for(let ee=0;ee<G;ee++){let ne=ee*k-j;for(let be=0;be<V;be++){let ke=be*C-H;X[y]=ke*b,X[m]=ne*_,X[g]=I,c.push(X.x,X.y,X.z),X[y]=0,X[m]=0,X[g]=E>0?1:-1,h.push(X.x,X.y,X.z),u.push(be/v),u.push(1-ee/A),W+=1}}for(let ee=0;ee<A;ee++)for(let ne=0;ne<v;ne++){let be=f+ne+V*ee,ke=f+ne+V*(ee+1),J=f+(ne+1)+V*(ee+1),me=f+(ne+1)+V*ee;l.push(be,ke,me),l.push(ke,J,me),te+=6}a.addGroup(d,te,L),d+=te,f+=W}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new n(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}};var Hr=class n extends vt{constructor(e=1,t=1,i=1,r=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:i,heightSegments:r};let s=e/2,o=t/2,a=Math.floor(i),l=Math.floor(r),c=a+1,h=l+1,u=e/a,f=t/l,d=[],p=[],y=[],m=[];for(let g=0;g<h;g++){let b=g*f-o;for(let _=0;_<c;_++){let x=_*u-s;p.push(x,-b,0),y.push(0,0,1),m.push(_/a),m.push(1-g/l)}}for(let g=0;g<l;g++)for(let b=0;b<a;b++){let _=b+c*g,x=b+c*(g+1),M=b+1+c*(g+1),E=b+1+c*g;d.push(_,x,E),d.push(x,M,E)}this.setIndex(d),this.setAttribute("position",new Ut(p,3)),this.setAttribute("normal",new Ut(y,3)),this.setAttribute("uv",new Ut(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new n(e.width,e.height,e.widthSegments,e.heightSegments)}};function $r(n){let e={};for(let t in n){e[t]={};for(let i in n[t]){let r=n[t][i];if(wm(r))r.isRenderTargetTexture?(Ie("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][i]=null):e[t][i]=r.clone();else if(Array.isArray(r))if(wm(r[0])){let s=[];for(let o=0,a=r.length;o<a;o++)s[o]=r[o].clone();e[t][i]=s}else e[t][i]=r.slice();else e[t][i]=r}}return e}function hn(n){let e={};for(let t=0;t<n.length;t++){let i=$r(n[t]);for(let r in i)e[r]=i[r]}return e}function wm(n){return n&&(n.isColor||n.isMatrix3||n.isMatrix4||n.isVector2||n.isVector3||n.isVector4||n.isTexture||n.isQuaternion)}function Bx(n){let e=[];for(let t=0;t<n.length;t++)e.push(n[t].clone());return e}function Dd(n){let e=n.getRenderTarget();return e===null?n.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:qe.workingColorSpace}var fg={clone:$r,merge:hn},zx=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Hx=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,Pn=class extends Di{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=zx,this.fragmentShader=Hx,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=$r(e.uniforms),this.uniformsGroups=Bx(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let r in this.uniforms){let o=this.uniforms[r].value;o&&o.isTexture?t.uniforms[r]={type:"t",value:o.toJSON(e).uuid}:o&&o.isColor?t.uniforms[r]={type:"c",value:o.getHex()}:o&&o.isVector2?t.uniforms[r]={type:"v2",value:o.toArray()}:o&&o.isVector3?t.uniforms[r]={type:"v3",value:o.toArray()}:o&&o.isVector4?t.uniforms[r]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?t.uniforms[r]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?t.uniforms[r]={type:"m4",value:o.toArray()}:t.uniforms[r]={value:o}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let i={};for(let r in this.extensions)this.extensions[r]===!0&&(i[r]=!0);return Object.keys(i).length>0&&(t.extensions=i),t}fromJSON(e,t){if(super.fromJSON(e,t),e.uniforms!==void 0)for(let i in e.uniforms){let r=e.uniforms[i];switch(this.uniforms[i]={},r.type){case"t":this.uniforms[i].value=t[r.value]||null;break;case"c":this.uniforms[i].value=new je().setHex(r.value);break;case"v2":this.uniforms[i].value=new Pe().fromArray(r.value);break;case"v3":this.uniforms[i].value=new O().fromArray(r.value);break;case"v4":this.uniforms[i].value=new at().fromArray(r.value);break;case"m3":this.uniforms[i].value=new Ue().fromArray(r.value);break;case"m4":this.uniforms[i].value=new ft().fromArray(r.value);break;default:this.uniforms[i].value=r.value}}if(e.defines!==void 0&&(this.defines=e.defines),e.vertexShader!==void 0&&(this.vertexShader=e.vertexShader),e.fragmentShader!==void 0&&(this.fragmentShader=e.fragmentShader),e.glslVersion!==void 0&&(this.glslVersion=e.glslVersion),e.extensions!==void 0)for(let i in e.extensions)this.extensions[i]=e.extensions[i];return e.lights!==void 0&&(this.lights=e.lights),e.clipping!==void 0&&(this.clipping=e.clipping),this}},tc=class extends Pn{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}};var nc=class extends Di{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=eg,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}},ic=class extends Di{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}};function bs(n,e){return!n||n.constructor===e?n:typeof e.BYTES_PER_ELEMENT=="number"?new e(n):Array.prototype.slice.call(n)}function kl(n){return n!==void 0&&n.inTangents!==void 0&&n.outTangents!==void 0}var sr=class{constructor(e,t,i,r){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=r!==void 0?r:new t.constructor(i),this.sampleValues=t,this.valueSize=i,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,i=this._cachedIndex,r=t[i],s=t[i-1];n:{e:{let o;t:{i:if(!(e<r)){for(let a=i+2;;){if(r===void 0){if(e<s)break i;return i=t.length,this._cachedIndex=i,this.copySampleValue_(i-1)}if(i===a)break;if(s=r,r=t[++i],e<r)break e}o=t.length;break t}if(!(e>=s)){let a=t[1];e<a&&(i=2,s=a);for(let l=i-2;;){if(s===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===l)break;if(r=s,s=t[--i-1],e>=s)break e}o=i,i=0;break t}break n}for(;i<o;){let a=i+o>>>1;e<t[a]?o=a:i=a+1}if(r=t[i],s=t[i-1],s===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(r===void 0)return i=t.length,this._cachedIndex=i,this.copySampleValue_(i-1)}this._cachedIndex=i,this.intervalChanged_(i,s,r)}return this.interpolate_(i,s,e,r)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,i=this.sampleValues,r=this.valueSize,s=e*r;for(let o=0;o!==r;++o)t[o]=i[s+o];return t}interpolate_(){throw new Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}},rc=class extends sr{constructor(e,t,i,r){super(e,t,i,r),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:Xu,endingEnd:Xu}}intervalChanged_(e,t,i){let r=this.parameterPositions,s=e-2,o=e+1,a=r[s],l=r[o];if(a===void 0)switch(this.getSettings_().endingStart){case qu:s=e,a=2*t-i;break;case Yu:s=r.length-2,a=t+r[s]-r[s+1];break;default:s=e,a=i}if(l===void 0)switch(this.getSettings_().endingEnd){case qu:o=e,l=2*i-t;break;case Yu:o=1,l=i+r[1]-r[0];break;default:o=e-1,l=t}let c=(i-t)*.5,h=this.valueSize;this._weightPrev=c/(t-a),this._weightNext=c/(l-i),this._offsetPrev=s*h,this._offsetNext=o*h}interpolate_(e,t,i,r){let s=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=e*a,c=l-a,h=this._offsetPrev,u=this._offsetNext,f=this._weightPrev,d=this._weightNext,p=(i-t)/(r-t),y=p*p,m=y*p,g=-f*m+2*f*y-f*p,b=(1+f)*m+(-1.5-2*f)*y+(-.5+f)*p+1,_=(-1-d)*m+(1.5+d)*y+.5*p,x=d*m-d*y;for(let M=0;M!==a;++M)s[M]=g*o[h+M]+b*o[c+M]+_*o[l+M]+x*o[u+M];return s}},sc=class extends sr{constructor(e,t,i,r){super(e,t,i,r)}interpolate_(e,t,i,r){let s=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=e*a,c=l-a,h=(i-t)/(r-t),u=1-h;for(let f=0;f!==a;++f)s[f]=o[c+f]*u+o[l+f]*h;return s}},oc=class extends sr{constructor(e,t,i,r){super(e,t,i,r)}interpolate_(e){return this.copySampleValue_(e-1)}},ac=class extends sr{interpolate_(e,t,i,r){let s=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=e*a,c=l-a,h=this.inTangents,u=this.outTangents;if(!h||!u){let p=(i-t)/(r-t),y=1-p;for(let m=0;m!==a;++m)s[m]=o[c+m]*y+o[l+m]*p;return s}let f=a*2,d=e-1;for(let p=0;p!==a;++p){let y=o[c+p],m=o[l+p],g=d*f+p*2,b=u[g],_=u[g+1],x=e*f+p*2,M=h[x],E=h[x+1],v=Gx(i,t,b,M,r);s[p]=pg(v,y,_,E,m)}return s}};function pg(n,e,t,i,r){let s=1-n;return s*s*s*e+3*s*s*n*t+3*s*n*n*i+n*n*n*r}function Vx(n,e,t,i,r){let s=1-n;return 3*s*s*(t-e)+6*s*n*(i-t)+3*n*n*(r-i)}function Gx(n,e,t,i,r){let s=(n-e)/(r-e);for(let o=0;o<8;o++){let a=pg(s,e,t,i,r)-n;if(Math.abs(a)<1e-10)break;let l=Vx(s,e,t,i,r);if(Math.abs(l)<1e-10)break;s=Math.max(0,Math.min(1,s-a/l))}return s}var In=class{constructor(e,t,i,r){if(e===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=bs(t,this.TimeBufferType),this.values=bs(i,this.ValueBufferType),this.setInterpolation(r||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,i;if(t.toJSON!==this.toJSON)i=t.toJSON(e);else{i={name:e.name,times:bs(e.times,Array),values:bs(e.values,Array)};let r=e.getInterpolation();r!==e.DefaultInterpolation&&(i.interpolation=r),kl(e.settings)&&(i.settings={inTangents:bs(e.settings.inTangents,Array),outTangents:bs(e.settings.outTangents,Array)})}return i.type=e.ValueTypeName,i}InterpolantFactoryMethodDiscrete(e){return new oc(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new sc(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new rc(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodBezier(e){let t=new ac(this.times,this.values,this.getValueSize(),e);return this.settings&&(t.inTangents=this.settings.inTangents,t.outTangents=this.settings.outTangents),t}setInterpolation(e){let t;switch(e){case Do:t=this.InterpolantFactoryMethodDiscrete;break;case Xl:t=this.InterpolantFactoryMethodLinear;break;case Fl:t=this.InterpolantFactoryMethodSmooth;break;case ju:t=this.InterpolantFactoryMethodBezier;break}if(t===void 0){let i="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(i);return Ie("KeyframeTrack:",i),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return Do;case this.InterpolantFactoryMethodLinear:return Xl;case this.InterpolantFactoryMethodSmooth:return Fl;case this.InterpolantFactoryMethodBezier:return ju}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let i=0,r=t.length;i!==r;++i)t[i]+=e;kl(this.settings)&&(Em(this.settings.inTangents,e),Em(this.settings.outTangents,e))}return this}scale(e){if(e!==1){let t=this.times;for(let i=0,r=t.length;i!==r;++i)t[i]*=e;kl(this.settings)&&(Tm(this.settings.inTangents,e),Tm(this.settings.outTangents,e))}return this}trim(e,t){let i=this.times,r=i.length,s=0,o=r-1;for(;s!==r&&i[s]<e;)++s;for(;o!==-1&&i[o]>t;)--o;if(++o,s!==0||o!==r){s>=o&&(o=Math.max(o,1),s=o-1);let a=this.getValueSize();this.times=i.slice(s,o),this.values=this.values.slice(s*a,o*a)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(Fe("KeyframeTrack: Invalid value size in track.",this),e=!1);let i=this.times,r=this.values,s=i.length;s===0&&(Fe("KeyframeTrack: Track is empty.",this),e=!1);let o=null;for(let a=0;a!==s;a++){let l=i[a];if(typeof l=="number"&&isNaN(l)){Fe("KeyframeTrack: Time is not a valid number.",this,a,l),e=!1;break}if(o!==null&&o>l){Fe("KeyframeTrack: Out of order keys.",this,a,l,o),e=!1;break}o=l}if(r!==void 0&&sx(r))for(let a=0,l=r.length;a!==l;++a){let c=r[a];if(isNaN(c)){Fe("KeyframeTrack: Value is not a valid number.",this,a,c),e=!1;break}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),i=this.getValueSize(),r=this.getInterpolation()===Fl,s=e.length-1,o=1;for(let a=1;a<s;++a){let l=!1,c=e[a],h=e[a+1];if(c!==h&&(a!==1||c!==e[0]))if(r)l=!0;else{let u=a*i,f=u-i,d=u+i;for(let p=0;p!==i;++p){let y=t[u+p];if(y!==t[f+p]||y!==t[d+p]){l=!0;break}}}if(l){if(a!==o){e[o]=e[a];let u=a*i,f=o*i;for(let d=0;d!==i;++d)t[f+d]=t[u+d]}++o}}if(s>0){e[o]=e[s];for(let a=s*i,l=o*i,c=0;c!==i;++c)t[l+c]=t[a+c];++o}return o!==e.length?(this.times=e.slice(0,o),this.values=t.slice(0,o*i)):(this.times=e,this.values=t),this}clone(){let e=this.times.slice(),t=this.values.slice(),i=this.constructor,r=new i(this.name,e,t);return r.createInterpolant=this.createInterpolant,kl(this.settings)&&(r.settings={inTangents:this.settings.inTangents.slice(),outTangents:this.settings.outTangents.slice()}),r}};function Em(n,e){for(let t=0,i=n.length;t!==i;t+=2)n[t]+=e}function Tm(n,e){for(let t=0,i=n.length;t!==i;t+=2)n[t]*=e}In.prototype.ValueTypeName="";In.prototype.TimeBufferType=Float32Array;In.prototype.ValueBufferType=Float32Array;In.prototype.DefaultInterpolation=Xl;var or=class extends In{constructor(e,t,i){super(e,t,i)}};or.prototype.ValueTypeName="bool";or.prototype.ValueBufferType=Array;or.prototype.DefaultInterpolation=Do;or.prototype.InterpolantFactoryMethodLinear=void 0;or.prototype.InterpolantFactoryMethodSmooth=void 0;var lc=class extends In{constructor(e,t,i,r){super(e,t,i,r)}};lc.prototype.ValueTypeName="color";var cc=class extends In{constructor(e,t,i,r){super(e,t,i,r)}};cc.prototype.ValueTypeName="number";var hc=class extends sr{constructor(e,t,i,r){super(e,t,i,r)}interpolate_(e,t,i,r){let s=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=(i-t)/(r-t),c=e*a;for(let h=c+a;c!==h;c+=4)Cn.slerpFlat(s,0,o,c-a,o,c,l);return s}},$o=class extends In{constructor(e,t,i,r){super(e,t,i,r)}InterpolantFactoryMethodLinear(e){return new hc(this.times,this.values,this.getValueSize(),e)}};$o.prototype.ValueTypeName="quaternion";$o.prototype.InterpolantFactoryMethodSmooth=void 0;var ar=class extends In{constructor(e,t,i){super(e,t,i)}};ar.prototype.ValueTypeName="string";ar.prototype.ValueBufferType=Array;ar.prototype.DefaultInterpolation=Do;ar.prototype.InterpolantFactoryMethodLinear=void 0;ar.prototype.InterpolantFactoryMethodSmooth=void 0;var uc=class extends In{constructor(e,t,i,r){super(e,t,i,r)}};uc.prototype.ValueTypeName="vector";var dc=class{constructor(e,t,i){let r=this,s=!1,o=0,a=0,l,c=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=i,this._abortController=null,this.itemStart=function(h){a++,s===!1&&r.onStart!==void 0&&r.onStart(h,o,a),s=!0},this.itemEnd=function(h){o++,r.onProgress!==void 0&&r.onProgress(h,o,a),o===a&&(s=!1,r.onLoad!==void 0&&r.onLoad())},this.itemError=function(h){r.onError!==void 0&&r.onError(h)},this.resolveURL=function(h){return h=h.normalize("NFC"),l?l(h):h},this.setURLModifier=function(h){return l=h,this},this.addHandler=function(h,u){return c.push(h,u),this},this.removeHandler=function(h){let u=c.indexOf(h);return u!==-1&&c.splice(u,2),this},this.getHandler=function(h){for(let u=0,f=c.length;u<f;u+=2){let d=c[u],p=c[u+1];if(d.global&&(d.lastIndex=0),d.test(h))return p}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||(this._abortController=new AbortController),this._abortController}},mg=new dc,fc=class{constructor(e){this.manager=e!==void 0?e:mg,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},this.priority="auto",this.cache="default",typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(e,t){let i=this;return new Promise(function(r,s){i.load(e,r,t,s)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}setPriority(e){return this.priority=e,this}setCache(e){return this.cache=e,this}abort(){return this}};fc.DEFAULT_MATERIAL_NAME="__DEFAULT";var Nl=new O,Ol=new Cn,pi=new O,jo=class extends Yt{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new ft,this.projectionMatrix=new ft,this.projectionMatrixInverse=new ft,this.coordinateSystem=$n,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose(Nl,Ol,pi),pi.x===1&&pi.y===1&&pi.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Nl,Ol,pi.set(1,1,1)).invert()}updateWorldMatrix(e,t,i=!1){super.updateWorldMatrix(e,t,i),this.matrixWorld.decompose(Nl,Ol,pi),pi.x===1&&pi.y===1&&pi.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Nl,Ol,pi.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}},er=new O,Am=new Pe,Rm=new Pe,cn=class extends jo{constructor(e=50,t=1,i=.1,r=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=i,this.far=r,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=ws*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(Io*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return ws*2*Math.atan(Math.tan(Io*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,i){er.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(er.x,er.y).multiplyScalar(-e/er.z),er.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),i.set(er.x,er.y).multiplyScalar(-e/er.z)}getViewSize(e,t){return this.getViewBounds(e,Am,Rm),t.subVectors(Rm,Am)}setViewOffset(e,t,i,r,s,o){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=r,this.view.width=s,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(Io*.5*this.fov)/this.zoom,i=2*t,r=this.aspect*i,s=-.5*r,o=this.view;if(this.view!==null&&this.view.enabled){let l=o.fullWidth,c=o.fullHeight;s+=o.offsetX*r/l,t-=o.offsetY*i/c,r*=o.width/l,i*=o.height/c}let a=this.filmOffset;a!==0&&(s+=e*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(s,s+r,t,t-i,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}};var Ln=class extends jo{constructor(e=-1,t=1,i=1,r=-1,s=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=i,this.bottom=r,this.near=s,this.far=o,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,i,r,s,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=r,this.view.width=s,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),i=(this.right+this.left)/2,r=(this.top+this.bottom)/2,s=i-e,o=i+e,a=r+t,l=r-t;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;s+=c*this.view.offsetX,o=s+c*this.view.width,a-=h*this.view.offsetY,l=a-h*this.view.height}this.projectionMatrix.makeOrthographic(s,o,a,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}};var ks=class extends vt{constructor(){super(),this.isInstancedBufferGeometry=!0,this.type="InstancedBufferGeometry",this.instanceCount=1/0}copy(e){return super.copy(e),this.instanceCount=e.instanceCount,this}toJSON(){let e=super.toJSON();return e.instanceCount=this.instanceCount,e.isInstancedBufferGeometry=!0,e}};var xs=-90,vs=1,Ns=class extends Yt{constructor(e,t,i){super(),this.type="CubeCamera",this.renderTarget=i,this.coordinateSystem=null,this.activeMipmapLevel=0;let r=new cn(xs,vs,e,t);r.layers=this.layers,this.add(r);let s=new cn(xs,vs,e,t);s.layers=this.layers,this.add(s);let o=new cn(xs,vs,e,t);o.layers=this.layers,this.add(o);let a=new cn(xs,vs,e,t);a.layers=this.layers,this.add(a);let l=new cn(xs,vs,e,t);l.layers=this.layers,this.add(l);let c=new cn(xs,vs,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[i,r,s,o,a,l]=t;for(let c of t)this.remove(c);if(e===$n)i.up.set(0,1,0),i.lookAt(1,0,0),r.up.set(0,1,0),r.lookAt(-1,0,0),s.up.set(0,0,-1),s.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(e===No)i.up.set(0,-1,0),i.lookAt(-1,0,0),r.up.set(0,-1,0),r.lookAt(1,0,0),s.up.set(0,0,1),s.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(let c of t)this.add(c),c.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let{renderTarget:i,activeMipmapLevel:r}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[s,o,a,l,c,h]=this.children,u=e.getRenderTarget(),f=e.getActiveCubeFace(),d=e.getActiveMipmapLevel(),p=e.xr.enabled;e.xr.enabled=!1;let y=i.texture.mipmapsAutoUpdate;i.texture.mipmapsAutoUpdate=!1;let m=!1;e.isWebGLRenderer===!0?m=e.state.buffers.depth.getReversed():m=e.reversedDepthBuffer,e.setRenderTarget(i,0,r),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,s),e.setRenderTarget(i,1,r),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(i,2,r),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(i,3,r),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),e.setRenderTarget(i,4,r),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),i.texture.mipmapsAutoUpdate=y,e.setRenderTarget(i,5,r),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,h),e.setRenderTarget(u,f,d),e.xr.enabled=p,i.texture.needsPMREMUpdate=!0}},pc=class extends cn{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e,this.perCameraFrustumCulled=!1}};var kd="\\[\\]\\.:\\/",Wx=new RegExp("["+kd+"]","g"),Nd="[^"+kd+"]",$x="[^"+kd.replace("\\.","")+"]",jx=/((?:WC+[\/:])*)/.source.replace("WC",Nd),Xx=/(WCOD+)?/.source.replace("WCOD",$x),qx=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Nd),Yx=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Nd),Jx=new RegExp("^"+jx+Xx+qx+Yx+"$"),Zx=["material","materials","bones","map"],Zu=class{constructor(e,t,i){let r=i||gt.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,r)}getValue(e,t){this.bind();let i=this._targetGroup.nCachedObjects_,r=this._bindings[i];r!==void 0&&r.getValue(e,t)}setValue(e,t){let i=this._bindings;for(let r=this._targetGroup.nCachedObjects_,s=i.length;r!==s;++r)i[r].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,i=e.length;t!==i;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,i=e.length;t!==i;++t)e[t].unbind()}},gt=class n{constructor(e,t,i){this.path=t,this.parsedPath=i||n.parseTrackName(t),this.node=n.findNode(e,this.parsedPath.nodeName),this.rootNode=e,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(e,t,i){return e&&e.isAnimationObjectGroup?new n.Composite(e,t,i):new n(e,t,i)}static sanitizeNodeName(e){return e.replace(/\s/g,"_").replace(Wx,"")}static parseTrackName(e){let t=Jx.exec(e);if(t===null)throw new Error("THREE.PropertyBinding: Cannot parse trackName: "+e);let i={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},r=i.nodeName&&i.nodeName.lastIndexOf(".");if(r!==void 0&&r!==-1){let s=i.nodeName.substring(r+1);Zx.indexOf(s)!==-1&&(i.nodeName=i.nodeName.substring(0,r),i.objectName=s)}if(i.propertyName===null||i.propertyName.length===0)throw new Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+e);return i}static findNode(e,t){if(t===void 0||t===""||t==="."||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let i=e.skeleton.getBoneByName(t);if(i!==void 0)return i}if(e.children){let i=function(s){for(let o=0;o<s.length;o++){let a=s[o];if(a.name===t||a.uuid===t)return a;let l=i(a.children);if(l)return l}return null},r=i(e.children);if(r)return r}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let i=this.resolvedProperty;for(let r=0,s=i.length;r!==s;++r)e[t++]=i[r]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let i=this.resolvedProperty;for(let r=0,s=i.length;r!==s;++r)i[r]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let i=this.resolvedProperty;for(let r=0,s=i.length;r!==s;++r)i[r]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let i=this.resolvedProperty;for(let r=0,s=i.length;r!==s;++r)i[r]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let e=this.node,t=this.parsedPath,i=t.objectName,r=t.propertyName,s=t.propertyIndex;if(e||(e=n.findNode(this.rootNode,t.nodeName),this.node=e),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!e){Ie("PropertyBinding: No target node found for track: "+this.path+".");return}if(i){let c=t.objectIndex;switch(i){case"materials":if(!e.material){Fe("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.materials){Fe("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}e=e.material.materials;break;case"bones":if(!e.skeleton){Fe("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}e=e.skeleton.bones;for(let h=0;h<e.length;h++)if(e[h].name===c){c=h;break}break;case"map":if("map"in e){e=e.map;break}if(!e.material){Fe("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.map){Fe("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}e=e.material.map;break;default:if(e[i]===void 0){Fe("PropertyBinding: Can not bind to objectName of node undefined.",this);return}e=e[i]}if(c!==void 0){if(e[c]===void 0){Fe("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,e);return}e=e[c]}}let o=e[r];if(o===void 0){let c=t.nodeName;Fe("PropertyBinding: Trying to update property for track: "+c+"."+r+" but it wasn't found.",e);return}let a=this.Versioning.None;this.targetObject=e,e.isMaterial===!0?a=this.Versioning.NeedsUpdate:e.isObject3D===!0&&(a=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(s!==void 0){if(r==="morphTargetInfluences"){if(!e.geometry){Fe("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!e.geometry.morphAttributes){Fe("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}e.morphTargetDictionary[s]!==void 0&&(s=e.morphTargetDictionary[s])}l=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=s}else o.fromArray!==void 0&&o.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(l=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=r;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][a]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};gt.Composite=Zu;gt.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};gt.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};gt.prototype.GetterByBindingType=[gt.prototype._getValue_direct,gt.prototype._getValue_array,gt.prototype._getValue_arrayElement,gt.prototype._getValue_toArray];gt.prototype.SetterByBindingTypeAndVersioning=[[gt.prototype._setValue_direct,gt.prototype._setValue_direct_setNeedsUpdate,gt.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[gt.prototype._setValue_array,gt.prototype._setValue_array_setNeedsUpdate,gt.prototype._setValue_array_setMatrixWorldNeedsUpdate],[gt.prototype._setValue_arrayElement,gt.prototype._setValue_arrayElement_setNeedsUpdate,gt.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[gt.prototype._setValue_fromArray,gt.prototype._setValue_fromArray_setNeedsUpdate,gt.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var U1=new Float32Array(1);var lr=class extends Zl{constructor(e,t,i=1){super(e,t),this.isInstancedInterleavedBuffer=!0,this.meshPerAttribute=i}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}clone(e){let t=super.clone(e);return t.meshPerAttribute=this.meshPerAttribute,t}toJSON(e){let t=super.toJSON(e);return t.isInstancedInterleavedBuffer=!0,t.meshPerAttribute=this.meshPerAttribute,t}};var Os=class{constructor(e=1,t=0,i=0){this.radius=e,this.phi=t,this.theta=i}set(e,t,i){return this.radius=e,this.phi=t,this.theta=i,this}copy(e){return this.radius=e.radius,this.phi=e.phi,this.theta=e.theta,this}makeSafe(){return this.phi=Ye(this.phi,1e-6,Math.PI-1e-6),this}setFromVector3(e){return this.setFromCartesianCoords(e.x,e.y,e.z)}setFromCartesianCoords(e,t,i){return this.radius=Math.sqrt(e*e+t*t+i*i),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(e,i),this.phi=Math.acos(Ye(t/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}};var Ku=class{static{this.prototype.isMatrix2=!0}constructor(e,t,i,r){this.elements=[1,0,0,1],e!==void 0&&this.set(e,t,i,r)}identity(){return this.set(1,0,0,1),this}fromArray(e,t=0){for(let i=0;i<4;i++)this.elements[i]=e[i+t];return this}set(e,t,i,r){let s=this.elements;return s[0]=e,s[2]=t,s[1]=i,s[3]=r,this}},Cm=new Pe,Xo=class{constructor(e=new Pe(1/0,1/0),t=new Pe(-1/0,-1/0)){this.isBox2=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromPoints(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let i=Cm.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(i),this.max.copy(e).add(i),this}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=1/0,this.max.x=this.max.y=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y}getCenter(e){return this.isEmpty()?e.set(0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Cm).distanceTo(e)}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}};var qo=class extends Qn{constructor(e,t=null){super(),this.object=e,this.domElement=t,this.enabled=!0,this.state=-1,this.keys={},this.mouseButtons={LEFT:null,MIDDLE:null,RIGHT:null},this.touches={ONE:null,TWO:null}}connect(e){this.domElement!==null&&this.disconnect(),this.domElement=e}disconnect(){}dispose(){}update(){}};function Od(n,e,t,i){let r=Kx(i);switch(t){case bd:return n*e;case vd:return n*e/r.components*r.byteLength;case _c:return n*e/r.components*r.byteLength;case hr:return n*e*2/r.components*r.byteLength;case Sc:return n*e*2/r.components*r.byteLength;case xd:return n*e*3/r.components*r.byteLength;case On:return n*e*4/r.components*r.byteLength;case Mc:return n*e*4/r.components*r.byteLength;case Zo:case Ko:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*8;case Qo:case ea:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*16;case Ec:case Ac:return Math.max(n,16)*Math.max(e,8)/4;case wc:case Tc:return Math.max(n,8)*Math.max(e,8)/2;case Rc:case Cc:case Ic:case Lc:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*8;case Pc:case ta:case Dc:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*16;case kc:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*16;case Nc:return Math.floor((n+4)/5)*Math.floor((e+3)/4)*16;case Oc:return Math.floor((n+4)/5)*Math.floor((e+4)/5)*16;case Fc:return Math.floor((n+5)/6)*Math.floor((e+4)/5)*16;case Uc:return Math.floor((n+5)/6)*Math.floor((e+5)/6)*16;case Bc:return Math.floor((n+7)/8)*Math.floor((e+4)/5)*16;case zc:return Math.floor((n+7)/8)*Math.floor((e+5)/6)*16;case Hc:return Math.floor((n+7)/8)*Math.floor((e+7)/8)*16;case Vc:return Math.floor((n+9)/10)*Math.floor((e+4)/5)*16;case Gc:return Math.floor((n+9)/10)*Math.floor((e+5)/6)*16;case Wc:return Math.floor((n+9)/10)*Math.floor((e+7)/8)*16;case $c:return Math.floor((n+9)/10)*Math.floor((e+9)/10)*16;case jc:return Math.floor((n+11)/12)*Math.floor((e+9)/10)*16;case Xc:return Math.floor((n+11)/12)*Math.floor((e+11)/12)*16;case qc:case Yc:case Jc:return Math.ceil(n/4)*Math.ceil(e/4)*16;case Zc:case Kc:return Math.ceil(n/4)*Math.ceil(e/4)*8;case na:case Qc:return Math.ceil(n/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function Kx(n){switch(n){case kn:case pd:return{byteLength:1,components:1};case zs:case md:case ii:return{byteLength:2,components:1};case xc:case vc:return{byteLength:2,components:4};case ni:case bc:case Nn:return{byteLength:4,components:1};case gd:case yd:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${n}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"187"}}));typeof window<"u"&&(window.__THREE__?Ie("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="187");function Fg(){let n=null,e=!1,t=null,i=null;function r(s,o){i=n.requestAnimationFrame(r),t(s,o)}return{start:function(){e!==!0&&t!==null&&n!==null&&(i=n.requestAnimationFrame(r),e=!0)},stop:function(){n!==null&&n.cancelAnimationFrame(i),e=!1},setAnimationLoop:function(s){t=s},setContext:function(s){n=s}}}function ev(n){let e=new WeakMap;function t(a,l){let c=a.array,h=a.usage,u=c.byteLength,f=n.createBuffer();n.bindBuffer(l,f),n.bufferData(l,c,h),a.onUploadCallback();let d;if(c instanceof Float32Array)d=n.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)d=n.HALF_FLOAT;else if(c instanceof Uint16Array)a.isFloat16BufferAttribute?d=n.HALF_FLOAT:d=n.UNSIGNED_SHORT;else if(c instanceof Int16Array)d=n.SHORT;else if(c instanceof Uint32Array)d=n.UNSIGNED_INT;else if(c instanceof Int32Array)d=n.INT;else if(c instanceof Int8Array)d=n.BYTE;else if(c instanceof Uint8Array)d=n.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)d=n.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:f,type:d,bytesPerElement:c.BYTES_PER_ELEMENT,version:a.version,size:u}}function i(a,l,c){let h=l.array,u=l.updateRanges;if(n.bindBuffer(c,a),u.length===0)n.bufferSubData(c,0,h);else{u.sort((d,p)=>d.start-p.start);let f=0;for(let d=1;d<u.length;d++){let p=u[f],y=u[d];y.start<=p.start+p.count+1?p.count=Math.max(p.count,y.start+y.count-p.start):(++f,u[f]=y)}u.length=f+1;for(let d=0,p=u.length;d<p;d++){let y=u[d];n.bufferSubData(c,y.start*h.BYTES_PER_ELEMENT,h,y.start,y.count)}l.clearUpdateRanges()}l.onUploadCallback()}function r(a){return a.isInterleavedBufferAttribute&&(a=a.data),e.get(a)}function s(a){a.isInterleavedBufferAttribute&&(a=a.data);let l=e.get(a);l&&(n.deleteBuffer(l.buffer),e.delete(a))}function o(a,l){if(a.isInterleavedBufferAttribute&&(a=a.data),a.isGLBufferAttribute){let h=e.get(a);(!h||h.version<a.version)&&e.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}let c=e.get(a);if(c===void 0)e.set(a,t(a,l));else if(c.version<a.version){if(c.size!==a.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");i(c.buffer,a,l),c.version=a.version}}return{get:r,remove:s,update:o}}var tv=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,nv=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,iv=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,rv=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,sv=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,ov=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,av=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,lv=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,cv=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,hv=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,uv=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,dv=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,fv=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,pv=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,mv=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,gv=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,yv=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,bv=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,xv=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,vv=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,_v=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,Sv=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,Mv=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,wv=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,Ev=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,Tv=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Av=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,Rv=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,Cv=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Pv="gl_FragColor = linearToOutputTexel( gl_FragColor );",Iv=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Lv=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,Dv=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	uniform samplerCube envMap;
	#ifdef ENVMAP_TYPE_PMREM
		float roughnessToMip( const in float roughness ) {
			float r = clamp( roughness, 0.0, 1.0 );
			return ENVMAP_MAX_LOD * r * ( 2.0 - r );
		}
	#endif
#endif`,kv=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,Nv=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Ov=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,Fv=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Uv=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Bv=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,zv=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Hv=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,Vv=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Gv=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,Wv=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,$v=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_SUN_LIGHTS > 0
	struct SunLight {
		vec3 direction;
		vec3 color;
	};
	uniform SunLight sunLights[ NUM_SUN_LIGHTS ];
	void getSunLightInfo( const in SunLight sunLight, out IncidentLight light ) {
		light.color = sunLight.color;
		light.direction = sunLight.direction;
		light.visible = true;
	}
#endif
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,jv=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_PMREM
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureLod( envMap, envMapRotation * worldNormal, ENVMAP_MAX_LOD );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_PMREM
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureLod( envMap, envMapRotation * reflectVec, roughnessToMip( roughness ) );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_RETROREFLECTION
		vec3 getIBLRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
			#ifdef ENVMAP_TYPE_PMREM
				vec3 retroVec = normalize( mix( viewDir, normal, pow4( roughness ) ) );
				retroVec = transformDirectionByInverseViewMatrix( retroVec, viewMatrix );
				vec4 envMapColor = textureLod( envMap, envMapRotation * retroVec, roughnessToMip( roughness ) );
				return envMapColor.rgb * envMapIntensity;
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_PMREM
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
		#ifdef USE_RETROREFLECTION
			vec3 getIBLAnisotropyRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
				#ifdef ENVMAP_TYPE_PMREM
					vec3 bentNormal = cross( bitangent, viewDir );
					bentNormal = normalize( cross( bentNormal, bitangent ) );
					bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
					return getIBLRetroRadiance( viewDir, bentNormal, roughness );
				#else
					return vec3( 0.0 );
				#endif
			}
		#endif
	#endif
#endif`,Xv=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,qv=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Yv=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Jv=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Zv=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.045 );
material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef USE_DIFFUSE_ROUGHNESS
	float diffuseRoughnessFactor = diffuseRoughness;
	#ifdef USE_DIFFUSE_ROUGHNESSMAP
		diffuseRoughnessFactor *= texture2D( diffuseRoughnessMap, vDiffuseRoughnessMapUv ).r;
	#endif
	material.diffuseRoughness = saturate( diffuseRoughnessFactor );
#endif
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.045 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_RETROREFLECTION
	material.retroreflectivity = retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,Kv=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	vec2 dfg;
	vec3 multiScatteringCompensation;
	#ifdef USE_DIFFUSE_ROUGHNESS
		float diffuseRoughness;
	#endif
	#ifdef USE_RETROREFLECTION
		float retroreflectivity;
	#endif
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0Dielectric;
		vec3 iridescenceF0Metallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
#ifdef USE_DIFFUSE_ROUGHNESS
	const float EON_EPSILON = 1e-7;
	float FON_DirectionalAlbedo( const in float mu, const in float roughness, const in float A ) {
		float muComp = 1.0 - mu;
		float gOverPi = muComp * ( 0.0571085289 + muComp * ( 0.491881867 + muComp * ( - 0.332181442 + muComp * 0.0714429953 ) ) );
		return A * ( 1.0 + roughness * gOverPi );
	}
	vec3 BRDF_EON( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 diffuseColor, const in float roughness ) {
		vec3 rho = saturate( diffuseColor );
		if ( roughness <= EON_EPSILON ) return BRDF_Lambert( rho );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float s = dot( lightDir, viewDir ) - dotNL * dotNV;
		float sOverT = ( s > 0.0 ) ? s / max( max( dotNL, dotNV ), EON_EPSILON ) : s;
		float A = 1.0 / ( 1.0 + ( 0.5 - 2.0 / ( 3.0 * PI ) ) * roughness );
		vec3 singleScatter = rho * RECIPROCAL_PI * A * ( 1.0 + roughness * sOverT );
		float averageAlbedo = A * ( 1.0 + ( 2.0 / 3.0 - 28.0 / ( 15.0 * PI ) ) * roughness );
		float albedoV = FON_DirectionalAlbedo( dotNV, roughness, A );
		float albedoL = FON_DirectionalAlbedo( dotNL, roughness, A );
		vec3 rhoMultiScatter = rho * rho * averageAlbedo / max( vec3( EON_EPSILON ), vec3( 1.0 ) - rho * ( 1.0 - averageAlbedo ) );
		vec3 multiScatter = rhoMultiScatter * RECIPROCAL_PI
			* max( EON_EPSILON, 1.0 - albedoV )
			* max( EON_EPSILON, 1.0 - albedoL )
			/ max( EON_EPSILON, 1.0 - averageAlbedo );
		return singleScatter + multiScatter;
	}
	vec3 EON_DirectionalAlbedo( const in vec3 diffuseColor, const in float roughness, const in float dotNV ) {
		vec3 rho = saturate( diffuseColor );
		if ( roughness <= EON_EPSILON ) return rho;
		float A = 1.0 / ( 1.0 + ( 0.5 - 2.0 / ( 3.0 * PI ) ) * roughness );
		float directionalAlbedo = FON_DirectionalAlbedo( dotNV, roughness, A );
		float averageAlbedo = A * ( 1.0 + ( 2.0 / 3.0 - 28.0 / ( 15.0 * PI ) ) * roughness );
		vec3 rhoMultiScatter = rho * rho * averageAlbedo / max( vec3( EON_EPSILON ), vec3( 1.0 ) - rho * ( 1.0 - averageAlbedo ) );
		return rho * directionalAlbedo + rhoMultiScatter * ( 1.0 - directionalAlbedo );
	}
#endif
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = max( material.clearcoatRoughness, 0.045 );
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = max( material.roughness, 0.045 );
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float alphaT = max( material.alphaT, alpha );
		float V = V_GGX_SmithCorrelated_Anisotropic( alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec2 fab, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec2 fab, const in vec3 specularColor, const in float specularF90, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	#ifdef USE_RETROREFLECTION
		vec3 retroViewDir = reflect( - geometryViewDir, geometryNormal );
		vec3 retroSpecularBRDF = BRDF_GGX( directLight.direction, retroViewDir, geometryNormal, material );
		specularBRDF = mix( specularBRDF, retroSpecularBRDF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;
	vec3 halfDir = normalize( directLight.direction + geometryViewDir );
	float dotVH = saturate( dot( geometryViewDir, halfDir ) );
	vec3 F = F_Schlick( material.specularColor, material.specularF90, dotVH );
	#ifdef USE_RETROREFLECTION
		vec3 retroHalfDir = normalize( directLight.direction + retroViewDir );
		float dotRetroVH = saturate( dot( retroViewDir, retroHalfDir ) );
		vec3 retroF = F_Schlick( material.specularColor, material.specularF90, dotRetroVH );
		F = mix( F, retroF, saturate( material.retroreflectivity ) );
	#endif
	#ifdef USE_DIFFUSE_ROUGHNESS
		vec3 diffuseBRDF = BRDF_EON( directLight.direction, geometryViewDir, geometryNormal, material.diffuseColor, material.diffuseRoughness ) * ( 1.0 - material.metalness );
	#else
		vec3 diffuseBRDF = BRDF_Lambert( material.diffuseContribution );
	#endif
	reflectedLight.directDiffuse += irradiance * diffuseBRDF * ( 1.0 - F );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScattering, multiScattering );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScattering, multiScattering );
	#endif
	#ifdef USE_DIFFUSE_ROUGHNESS
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		vec3 diffuseAlbedo = EON_DirectionalAlbedo( material.diffuseColor, material.diffuseRoughness, dotNV ) * ( 1.0 - material.metalness );
		vec3 diffuse = irradiance * RECIPROCAL_PI * diffuseAlbedo * ( 1.0 - singleScattering - multiScattering );
	#else
		vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - singleScattering - multiScattering );
	#endif
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		sheenSpecularIndirect += irradiance * material.sheenColor * sheenAlbedo * RECIPROCAL_PI;
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( material.dfg, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceF0Metallic, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( material.dfg, material.diffuseColor, material.specularF90, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	#ifdef USE_DIFFUSE_ROUGHNESS
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		vec3 diffuse = EON_DirectionalAlbedo( material.diffuseColor, material.diffuseRoughness, dotNV ) * ( 1.0 - material.metalness ) * ( 1.0 - totalScatteringDielectric );
	#else
		vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	#endif
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,Qv=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		vec3 iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		vec3 iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( iridescenceFresnelDielectric, iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0Dielectric = Schlick_to_F0( iridescenceFresnelDielectric, 1.0, dotNVi );
		material.iridescenceF0Metallic = Schlick_to_F0( iridescenceFresnelMetallic, 1.0, dotNVi );
	}
#endif
#ifdef STANDARD
	float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
	material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
	#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
		float EssMs = material.dfg.x + material.dfg.y;
		material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
	#endif
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )
	SunLight sunLight;
	#if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHTS; i ++ ) {
		sunLight = sunLights[ i ];
		getSunLightInfo( sunLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SUN_LIGHT_SHADOWS )
		sunLightShadow = sunLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_LIGHT_PROBE_GRIDS > 0
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		int probeGrid = - 1;
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_LIGHT_PROBE_GRIDS; i ++ ) {
			if ( isInsideLightProbeGrid( probeWorldPos, probeWorldNormal, probesMin[ i ], probesMax[ i ], probesResolution[ i ] ) ) probeGrid = UNROLLED_LOOP_INDEX;
		}
		#pragma unroll_loop_end
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_LIGHT_PROBE_GRIDS; i ++ ) {
			if ( probeGrid == UNROLLED_LOOP_INDEX ) irradiance += getLightProbeGridIrradiance( probesSH[ i ], probesMin[ i ], probesMax[ i ], probesResolution[ i ], probeWorldPos, probeWorldNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,e_=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_PMREM )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		vec3 iblRadiance = getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_RETROREFLECTION
		#ifdef USE_ANISOTROPY
			vec3 retroIBLRadiance = getIBLAnisotropyRetroRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
		#else
			vec3 retroIBLRadiance = getIBLRetroRadiance( geometryViewDir, geometryNormal, material.roughness );
		#endif
		iblRadiance = mix( iblRadiance, retroIBLRadiance, saturate( material.retroreflectivity ) );
	#endif
	radiance += iblRadiance;
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,t_=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,n_=`#if NUM_LIGHT_PROBE_GRIDS > 0
uniform highp sampler3D probesSH[ NUM_LIGHT_PROBE_GRIDS ];
uniform vec3 probesMin[ NUM_LIGHT_PROBE_GRIDS ];
uniform vec3 probesMax[ NUM_LIGHT_PROBE_GRIDS ];
uniform vec3 probesResolution[ NUM_LIGHT_PROBE_GRIDS ];
bool isInsideLightProbeGrid( vec3 worldPos, vec3 worldNormal, vec3 probesMin, vec3 probesMax, vec3 probesResolution ) {
	vec3 spacing = ( probesMax - probesMin ) / probesResolution;
	vec3 samplePos = worldPos + worldNormal * spacing * 0.5;
	vec3 margin = spacing * 0.01;
	return all( greaterThanEqual( samplePos, probesMin - margin ) ) && all( lessThanEqual( samplePos, probesMax + margin ) );
}
vec3 getLightProbeGridIrradiance( highp sampler3D probesSH, vec3 probesMin, vec3 probesMax, vec3 probesResolution, vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 probeSpacing = gridRange / res;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.5 / res, 1.0 - 0.5 / res );
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,i_=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,r_=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,s_=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,o_=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,a_=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,l_=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,c_=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,h_=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,u_=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,d_=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,f_=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,p_=`#if defined( USE_MORPHCOLORS )
	#if defined( USE_COLOR_ALPHA )
		vColor *= morphTargetBaseInfluence;
	#elif defined( USE_COLOR )
		vColor.rgb *= morphTargetBaseInfluence;
	#endif
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor.rgb += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,m_=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,g_=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,y_=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,b_=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,x_=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,v_=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,__=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,S_=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,M_=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,w_=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,E_=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,T_=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,A_=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,R_=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,C_=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,P_=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,I_=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,L_=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,D_=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,k_=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,N_=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,O_=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		#define SUN_LIGHT_CASCADES 2
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#else
			uniform sampler2D sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#endif
		uniform mat4 sunShadowMatrix[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		uniform vec4 sunShadowCascade[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
		struct SunLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SunLightShadow sunLightShadows[ NUM_SUN_LIGHT_SHADOWS ];
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				vec2 radius = shadowRadius * texelSize;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_SUN_LIGHT_SHADOWS > 0
		float getSunShadow(
			#if defined( SHADOWMAP_TYPE_PCF )
				sampler2DShadow shadowMap,
			#else
				sampler2D shadowMap,
			#endif
			SunLightShadow sunLightShadow,
			int shadowIndex
		) {
			vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );
			float viewDepth = vSunShadowWorldPosition.w;
			int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;
			float shadow = 1.0;
			for ( int i = SUN_LIGHT_CASCADES - 1; i >= 0; i -- ) {
				vec4 cascade = sunShadowCascade[ cascadeOffset + i ];
				if ( viewDepth >= cascade.x && viewDepth < cascade.y ) {
					float cascadeShadow = getShadow(
						shadowMap,
						sunLightShadow.shadowMapSize,
						sunLightShadow.shadowIntensity,
						sunLightShadow.shadowBias,
						sunLightShadow.shadowRadius,
						sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition
					);
					shadow = mix( cascadeShadow, shadow, smoothstep( cascade.z, cascade.y, viewDepth ) );
				}
			}
			return shadow;
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float lightDistance = length( lightToPosition );
			float depthRange = shadowCameraFar - shadowCameraNear;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float depthA = - shadowCameraNear / depthRange - shadowBias;
				float depthB = shadowCameraNear * shadowCameraFar / ( depthRange * lightDistance );
			#else
				float depthA = shadowCameraFar / depthRange + shadowBias;
				float depthB = - shadowCameraNear * shadowCameraFar / ( depthRange * lightDistance );
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			shadow = 0.0;
			for ( int i = 0; i < 5; i ++ ) {
				vec2 offset = vogelDiskSample( i, 5, phi );
				vec3 direction = bd3D + ( tangent * offset.x + bitangent * offset.y ) * texelSize;
				vec3 absDirection = abs( direction );
				float dp = depthA + depthB / max( max( absDirection.x, absDirection.y ), absDirection.z );
				shadow += texture( shadowMap, vec4( direction, dp ) );
			}
			shadow *= 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,F_=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,U_=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_SUN_LIGHT_SHADOWS > 0
		vSunShadowWorldPosition = vec4( worldPosition.xyz, - mvPosition.z );
		vSunShadowWorldNormal = shadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,B_=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHT_SHADOWS; i ++ ) {
		sunLight = sunLightShadows[ i ];
		shadow *= receiveShadow ? getSunShadow( sunShadowMap[ i ], sunLight, UNROLLED_LOOP_INDEX ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,z_=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,H_=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,V_=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,G_=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,W_=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,$_=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,j_=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,X_=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,q_=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,Y_=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,J_=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_DIFFUSE_ROUGHNESSMAP
	varying vec2 vDiffuseRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Z_=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_DIFFUSE_ROUGHNESSMAP
	uniform mat3 diffuseRoughnessMapTransform;
	varying vec2 vDiffuseRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,K_=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DIFFUSE_ROUGHNESSMAP
	vDiffuseRoughnessMapUv = ( diffuseRoughnessMapTransform * vec3( DIFFUSE_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,Q_=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,eS=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,tS=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,nS=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,iS=`uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <envmap_common_pars_fragment>
void main() {
	#ifdef ENVMAP_TYPE_PMREM
		vec4 texColor = textureLod( envMap, backgroundRotation * vWorldDirection, roughnessToMip( backgroundBlurriness ) );
	#else
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,rS=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,sS=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,oS=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,aS=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,lS=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,cS=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,hS=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,uS=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,dS=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,fS=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,pS=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,mS=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,gS=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,yS=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,bS=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,xS=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,vS=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,_S=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,SS=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,MS=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,wS=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,ES=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DIFFUSE_ROUGHNESS
	uniform float diffuseRoughness;
	#ifdef USE_DIFFUSE_ROUGHNESSMAP
		uniform sampler2D diffuseRoughnessMap;
	#endif
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_RETROREFLECTION
	uniform float retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,TS=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,AS=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,RS=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,CS=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,PS=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,IS=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,LS=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,DS=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Xe={alphahash_fragment:tv,alphahash_pars_fragment:nv,alphamap_fragment:iv,alphamap_pars_fragment:rv,alphatest_fragment:sv,alphatest_pars_fragment:ov,aomap_fragment:av,aomap_pars_fragment:lv,batching_pars_vertex:cv,batching_vertex:hv,begin_vertex:uv,beginnormal_vertex:dv,bsdfs:fv,iridescence_fragment:pv,bumpmap_pars_fragment:mv,clipping_planes_fragment:gv,clipping_planes_pars_fragment:yv,clipping_planes_pars_vertex:bv,clipping_planes_vertex:xv,color_fragment:vv,color_pars_fragment:_v,color_pars_vertex:Sv,color_vertex:Mv,common:wv,defaultnormal_vertex:Ev,displacementmap_pars_vertex:Tv,displacementmap_vertex:Av,emissivemap_fragment:Rv,emissivemap_pars_fragment:Cv,colorspace_fragment:Pv,colorspace_pars_fragment:Iv,envmap_fragment:Lv,envmap_common_pars_fragment:Dv,envmap_pars_fragment:kv,envmap_pars_vertex:Nv,envmap_physical_pars_fragment:jv,envmap_vertex:Ov,fog_vertex:Fv,fog_pars_vertex:Uv,fog_fragment:Bv,fog_pars_fragment:zv,gradientmap_pars_fragment:Hv,lightmap_pars_fragment:Vv,lights_lambert_fragment:Gv,lights_lambert_pars_fragment:Wv,lights_pars_begin:$v,lights_toon_fragment:Xv,lights_toon_pars_fragment:qv,lights_phong_fragment:Yv,lights_phong_pars_fragment:Jv,lights_physical_fragment:Zv,lights_physical_pars_fragment:Kv,lights_fragment_begin:Qv,lights_fragment_maps:e_,lights_fragment_end:t_,lightprobes_pars_fragment:n_,logdepthbuf_fragment:i_,logdepthbuf_pars_fragment:r_,logdepthbuf_pars_vertex:s_,logdepthbuf_vertex:o_,map_fragment:a_,map_pars_fragment:l_,map_particle_fragment:c_,map_particle_pars_fragment:h_,metalnessmap_fragment:u_,metalnessmap_pars_fragment:d_,morphinstance_vertex:f_,morphcolor_vertex:p_,morphnormal_vertex:m_,morphtarget_pars_vertex:g_,morphtarget_vertex:y_,normal_fragment_begin:b_,normal_fragment_maps:x_,normal_pars_fragment:v_,normal_pars_vertex:__,normal_vertex:S_,normalmap_pars_fragment:M_,clearcoat_normal_fragment_begin:w_,clearcoat_normal_fragment_maps:E_,clearcoat_pars_fragment:T_,iridescence_pars_fragment:A_,opaque_fragment:R_,packing:C_,premultiplied_alpha_fragment:P_,project_vertex:I_,dithering_fragment:L_,dithering_pars_fragment:D_,roughnessmap_fragment:k_,roughnessmap_pars_fragment:N_,shadowmap_pars_fragment:O_,shadowmap_pars_vertex:F_,shadowmap_vertex:U_,shadowmask_pars_fragment:B_,skinbase_vertex:z_,skinning_pars_vertex:H_,skinning_vertex:V_,skinnormal_vertex:G_,specularmap_fragment:W_,specularmap_pars_fragment:$_,tonemapping_fragment:j_,tonemapping_pars_fragment:X_,transmission_fragment:q_,transmission_pars_fragment:Y_,uv_pars_fragment:J_,uv_pars_vertex:Z_,uv_vertex:K_,worldpos_vertex:Q_,background_vert:eS,background_frag:tS,backgroundCube_vert:nS,backgroundCube_frag:iS,cube_vert:rS,cube_frag:sS,depth_vert:oS,depth_frag:aS,distance_vert:lS,distance_frag:cS,equirect_vert:hS,equirect_frag:uS,linedashed_vert:dS,linedashed_frag:fS,meshbasic_vert:pS,meshbasic_frag:mS,meshlambert_vert:gS,meshlambert_frag:yS,meshmatcap_vert:bS,meshmatcap_frag:xS,meshnormal_vert:vS,meshnormal_frag:_S,meshphong_vert:SS,meshphong_frag:MS,meshphysical_vert:wS,meshphysical_frag:ES,meshtoon_vert:TS,meshtoon_frag:AS,points_vert:RS,points_frag:CS,shadow_vert:PS,shadow_frag:IS,sprite_vert:LS,sprite_frag:DS},ye={common:{diffuse:{value:new je(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Ue},alphaMap:{value:null},alphaMapTransform:{value:new Ue},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Ue}},envmap:{envMap:{value:null},envMapRotation:{value:new Ue},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Ue}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Ue}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Ue},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Ue},normalScale:{value:new Pe(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Ue},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Ue}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Ue}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Ue}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new je(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:[]},probesMin:{value:[]},probesMax:{value:[]},probesResolution:{value:[]}},points:{diffuse:{value:new je(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Ue},alphaTest:{value:0},uvTransform:{value:new Ue}},sprite:{diffuse:{value:new je(16777215)},opacity:{value:1},center:{value:new Pe(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Ue},alphaMap:{value:null},alphaMapTransform:{value:new Ue},alphaTest:{value:0}}},xi={basic:{uniforms:hn([ye.common,ye.specularmap,ye.envmap,ye.aomap,ye.lightmap,ye.fog]),vertexShader:Xe.meshbasic_vert,fragmentShader:Xe.meshbasic_frag},lambert:{uniforms:hn([ye.common,ye.specularmap,ye.envmap,ye.aomap,ye.lightmap,ye.emissivemap,ye.bumpmap,ye.normalmap,ye.displacementmap,ye.fog,ye.lights,{emissive:{value:new je(0)},envMapIntensity:{value:1}}]),vertexShader:Xe.meshlambert_vert,fragmentShader:Xe.meshlambert_frag},phong:{uniforms:hn([ye.common,ye.specularmap,ye.envmap,ye.aomap,ye.lightmap,ye.emissivemap,ye.bumpmap,ye.normalmap,ye.displacementmap,ye.fog,ye.lights,{emissive:{value:new je(0)},specular:{value:new je(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Xe.meshphong_vert,fragmentShader:Xe.meshphong_frag},standard:{uniforms:hn([ye.common,ye.envmap,ye.aomap,ye.lightmap,ye.emissivemap,ye.bumpmap,ye.normalmap,ye.displacementmap,ye.roughnessmap,ye.metalnessmap,ye.fog,ye.lights,{emissive:{value:new je(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Xe.meshphysical_vert,fragmentShader:Xe.meshphysical_frag},toon:{uniforms:hn([ye.common,ye.aomap,ye.lightmap,ye.emissivemap,ye.bumpmap,ye.normalmap,ye.displacementmap,ye.gradientmap,ye.fog,ye.lights,{emissive:{value:new je(0)}}]),vertexShader:Xe.meshtoon_vert,fragmentShader:Xe.meshtoon_frag},matcap:{uniforms:hn([ye.common,ye.bumpmap,ye.normalmap,ye.displacementmap,ye.fog,{matcap:{value:null}}]),vertexShader:Xe.meshmatcap_vert,fragmentShader:Xe.meshmatcap_frag},points:{uniforms:hn([ye.points,ye.fog]),vertexShader:Xe.points_vert,fragmentShader:Xe.points_frag},dashed:{uniforms:hn([ye.common,ye.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Xe.linedashed_vert,fragmentShader:Xe.linedashed_frag},depth:{uniforms:hn([ye.common,ye.displacementmap]),vertexShader:Xe.depth_vert,fragmentShader:Xe.depth_frag},normal:{uniforms:hn([ye.common,ye.bumpmap,ye.normalmap,ye.displacementmap,{opacity:{value:1}}]),vertexShader:Xe.meshnormal_vert,fragmentShader:Xe.meshnormal_frag},sprite:{uniforms:hn([ye.sprite,ye.fog]),vertexShader:Xe.sprite_vert,fragmentShader:Xe.sprite_frag},background:{uniforms:{uvTransform:{value:new Ue},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Xe.background_vert,fragmentShader:Xe.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Ue}},vertexShader:Xe.backgroundCube_vert,fragmentShader:Xe.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Xe.cube_vert,fragmentShader:Xe.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Xe.equirect_vert,fragmentShader:Xe.equirect_frag},distance:{uniforms:hn([ye.common,ye.displacementmap,{referencePosition:{value:new O},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Xe.distance_vert,fragmentShader:Xe.distance_frag},shadow:{uniforms:hn([ye.lights,ye.fog,{color:{value:new je(0)},opacity:{value:1}}]),vertexShader:Xe.shadow_vert,fragmentShader:Xe.shadow_frag}};xi.physical={uniforms:hn([xi.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Ue},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Ue},clearcoatNormalScale:{value:new Pe(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Ue},diffuseRoughness:{value:0},diffuseRoughnessMap:{value:null},diffuseRoughnessMapTransform:{value:new Ue},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Ue},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Ue},sheen:{value:0},sheenColor:{value:new je(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Ue},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Ue},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Ue},transmissionSamplerSize:{value:new Pe},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Ue},attenuationDistance:{value:0},attenuationColor:{value:new je(0)},specularColor:{value:new je(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Ue},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Ue},anisotropyVector:{value:new Pe},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Ue}}]),vertexShader:Xe.meshphysical_vert,fragmentShader:Xe.meshphysical_frag};var th={r:0,b:0,g:0},kS=new ft,Ug=new Ue;Ug.set(-1,0,0,0,1,0,0,0,1);function NS(n,e,t,i,r,s){let o=new je(0),a=r===!0?0:1,l,c,h=null,u=0,f=null;function d(b){let _=b.isScene===!0?b.background:null;if(_&&_.isTexture){let x=b.backgroundBlurriness>0;_=e.get(_,x)}return _}function p(b){let _=!1,x=d(b);x===null?m(o,a):x&&x.isColor&&(m(x,1),_=!0);let M=n.xr.getEnvironmentBlendMode();M==="additive"?t.buffers.color.setClear(0,0,0,1,s):M==="alpha-blend"&&t.buffers.color.setClear(0,0,0,0,s),(n.autoClear||_)&&(t.buffers.depth.setTest(!0),t.buffers.depth.setMask(!0),t.buffers.color.setMask(!0),n.clear(n.autoClearColor,n.autoClearDepth,n.autoClearStencil))}function y(b,_){let x=d(_);x&&x.isCubeTexture?(c===void 0&&(c=new Jt(new Ds(1,1,1),new Pn({name:"BackgroundCubeMaterial",uniforms:$r(xi.backgroundCube.uniforms),vertexShader:xi.backgroundCube.vertexShader,fragmentShader:xi.backgroundCube.fragmentShader,side:gn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(M,E,v){this.matrixWorld.copyPosition(v.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(c)),c.material.uniforms.envMap.value=x,c.material.uniforms.backgroundBlurriness.value=_.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=_.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(kS.makeRotationFromEuler(_.backgroundRotation)).transpose(),x.isRenderTargetTexture===!1&&c.material.uniforms.backgroundRotation.value.premultiply(Ug),c.material.toneMapped=qe.getTransfer(x.colorSpace)!==ot,(h!==x||u!==x.version||f!==n.toneMapping)&&(c.material.needsUpdate=!0,h=x,u=x.version,f=n.toneMapping),c.layers.enableAll(),b.unshift(c,c.geometry,c.material,0,0,null)):x&&x.isTexture&&(l===void 0&&(l=new Jt(new Hr(2,2),new Pn({name:"BackgroundMaterial",uniforms:$r(xi.background.uniforms),vertexShader:xi.background.vertexShader,fragmentShader:xi.background.fragmentShader,side:cr,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(l)),l.material.uniforms.t2D.value=x,l.material.uniforms.backgroundIntensity.value=_.backgroundIntensity,l.material.toneMapped=qe.getTransfer(x.colorSpace)!==ot,x.matrixAutoUpdate===!0&&x.updateMatrix(),l.material.uniforms.uvTransform.value.copy(x.matrix),(h!==x||u!==x.version||f!==n.toneMapping)&&(l.material.needsUpdate=!0,h=x,u=x.version,f=n.toneMapping),l.layers.enableAll(),b.unshift(l,l.geometry,l.material,0,0,null))}function m(b,_){b.getRGB(th,Dd(n)),t.buffers.color.setClear(th.r,th.g,th.b,_,s)}function g(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return o},setClearColor:function(b,_=1){o.set(b),a=_,m(o,a)},getClearAlpha:function(){return a},setClearAlpha:function(b){a=b,m(o,a)},render:p,addToRenderList:y,dispose:g}}function OS(n,e){let t=n.getParameter(n.MAX_VERTEX_ATTRIBS),i={},r=f(null),s=r,o=!1;function a(k,H,j,I,V){let G=!1,W=u(k,I,j,H);s!==W&&(s=W,c(s.object)),G=d(k,I,j,V),G&&p(k,I,j,V),V!==null&&e.update(V,n.ELEMENT_ARRAY_BUFFER),(G||o)&&(o=!1,x(k,H,j,I),V!==null&&n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,e.get(V).buffer))}function l(){return n.createVertexArray()}function c(k){return n.bindVertexArray(k)}function h(k){return n.deleteVertexArray(k)}function u(k,H,j,I){let V=I.wireframe===!0,G=i[H.id];G===void 0&&(G={},i[H.id]=G);let W=k.isInstancedMesh===!0?k.id:0,te=G[W];te===void 0&&(te={},G[W]=te);let X=te[j.id];X===void 0&&(X={},te[j.id]=X);let ee=X[V];return ee===void 0&&(ee=f(l()),X[V]=ee),ee}function f(k){let H=[],j=[],I=[];for(let V=0;V<t;V++)H[V]=0,j[V]=0,I[V]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:H,enabledAttributes:j,attributeDivisors:I,object:k,attributes:{},index:null}}function d(k,H,j,I){let V=s.attributes,G=H.attributes,W=0,te=j.getAttributes();for(let X in te)if(te[X].location>=0){let ne=V[X],be=G[X];if(be===void 0&&(X==="instanceMatrix"&&k.instanceMatrix&&(be=k.instanceMatrix),X==="instanceColor"&&k.instanceColor&&(be=k.instanceColor)),ne===void 0||ne.attribute!==be||be&&ne.data!==be.data)return!0;W++}return s.attributesNum!==W||s.index!==I}function p(k,H,j,I){let V={},G=H.attributes,W=0,te=j.getAttributes();for(let X in te)if(te[X].location>=0){let ne=G[X];ne===void 0&&(X==="instanceMatrix"&&k.instanceMatrix&&(ne=k.instanceMatrix),X==="instanceColor"&&k.instanceColor&&(ne=k.instanceColor));let be={};be.attribute=ne,ne&&ne.data&&(be.data=ne.data),V[X]=be,W++}s.attributes=V,s.attributesNum=W,s.index=I}function y(){let k=s.newAttributes;for(let H=0,j=k.length;H<j;H++)k[H]=0}function m(k){g(k,0)}function g(k,H){let j=s.newAttributes,I=s.enabledAttributes,V=s.attributeDivisors;j[k]=1,I[k]===0&&(n.enableVertexAttribArray(k),I[k]=1),V[k]!==H&&(n.vertexAttribDivisor(k,H),V[k]=H)}function b(){let k=s.newAttributes,H=s.enabledAttributes;for(let j=0,I=H.length;j<I;j++)H[j]!==k[j]&&(n.disableVertexAttribArray(j),H[j]=0)}function _(k,H,j,I,V,G,W){W===!0?n.vertexAttribIPointer(k,H,j,V,G):n.vertexAttribPointer(k,H,j,I,V,G)}function x(k,H,j,I){y();let V=I.attributes,G=j.getAttributes(),W=H.defaultAttributeValues;for(let te in G){let X=G[te];if(X.location>=0){let ee=V[te];if(ee===void 0&&(te==="instanceMatrix"&&k.instanceMatrix&&(ee=k.instanceMatrix),te==="instanceColor"&&k.instanceColor&&(ee=k.instanceColor)),ee!==void 0){let ne=ee.normalized,be=ee.itemSize,ke=e.get(ee);if(ke===void 0)continue;let J=ke.buffer,me=ke.type,Me=ke.bytesPerElement,Le=me===n.INT||me===n.UNSIGNED_INT||ee.gpuType===bc;if(ee.isInterleavedBufferAttribute){let xe=ee.data,He=xe.isInterleavedBuffer===!0?xe.stride:xe.itemSize,At=ee.offset;if(xe.isInstancedInterleavedBuffer||xe.isInstancedBufferAttribute){for(let Ne=0;Ne<X.locationSize;Ne++)g(X.location+Ne,xe.meshPerAttribute);k.isInstancedMesh!==!0&&I._maxInstanceCount===void 0&&(I._maxInstanceCount=xe.meshPerAttribute*xe.count)}else for(let Ne=0;Ne<X.locationSize;Ne++)m(X.location+Ne);n.bindBuffer(n.ARRAY_BUFFER,J);for(let Ne=0;Ne<X.locationSize;Ne++)_(X.location+Ne,be/X.locationSize,me,ne,He*Me,(At+be/X.locationSize*Ne)*Me,Le)}else{if(ee.isInstancedBufferAttribute){for(let xe=0;xe<X.locationSize;xe++)g(X.location+xe,ee.meshPerAttribute);k.isInstancedMesh!==!0&&I._maxInstanceCount===void 0&&(I._maxInstanceCount=ee.meshPerAttribute*ee.count)}else for(let xe=0;xe<X.locationSize;xe++)m(X.location+xe);n.bindBuffer(n.ARRAY_BUFFER,J);for(let xe=0;xe<X.locationSize;xe++)_(X.location+xe,be/X.locationSize,me,ne,be*Me,be/X.locationSize*xe*Me,Le)}}else if(W!==void 0){let ne=W[te];if(ne!==void 0)switch(ne.length){case 2:n.vertexAttrib2fv(X.location,ne);break;case 3:n.vertexAttrib3fv(X.location,ne);break;case 4:n.vertexAttrib4fv(X.location,ne);break;default:n.vertexAttrib1fv(X.location,ne)}}}}b()}function M(){L();for(let k in i){let H=i[k];for(let j in H){let I=H[j];for(let V in I){let G=I[V];for(let W in G)h(G[W].object),delete G[W];delete I[V]}}delete i[k]}}function E(k){if(i[k.id]===void 0)return;let H=i[k.id];for(let j in H){let I=H[j];for(let V in I){let G=I[V];for(let W in G)h(G[W].object),delete G[W];delete I[V]}}delete i[k.id]}function v(k){for(let H in i){let j=i[H];for(let I in j){let V=j[I];if(V[k.id]===void 0)continue;let G=V[k.id];for(let W in G)h(G[W].object),delete G[W];delete V[k.id]}}}function A(k){for(let H in i){let j=i[H],I=k.isInstancedMesh===!0?k.id:0,V=j[I];if(V!==void 0){for(let G in V){let W=V[G];for(let te in W)h(W[te].object),delete W[te];delete V[G]}delete j[I],Object.keys(j).length===0&&delete i[H]}}}function L(){C(),o=!0,s!==r&&(s=r,c(s.object))}function C(){r.geometry=null,r.program=null,r.wireframe=!1}return{setup:a,reset:L,resetDefaultState:C,dispose:M,releaseStatesOfGeometry:E,releaseStatesOfObject:A,releaseStatesOfProgram:v,initAttributes:y,enableAttribute:m,disableUnusedAttributes:b}}function FS(n,e,t){let i;function r(l){i=l}function s(l,c){n.drawArrays(i,l,c),t.update(c,i,1)}function o(l,c,h){h!==0&&(n.drawArraysInstanced(i,l,c,h),t.update(c,i,h))}function a(l,c,h){if(h===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(i,l,0,c,0,h);let f=0;for(let d=0;d<h;d++)f+=c[d];t.update(f,i,1)}this.setMode=r,this.render=s,this.renderInstances=o,this.renderMultiDraw=a}function US(n,e,t,i){let r;function s(){if(r!==void 0)return r;if(e.has("EXT_texture_filter_anisotropic")===!0){let v=e.get("EXT_texture_filter_anisotropic");r=n.getParameter(v.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else r=0;return r}function o(v){return!(v!==On&&i.convert(v)!==n.getParameter(n.IMPLEMENTATION_COLOR_READ_FORMAT))}function a(v){let A=v===ii&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(v!==kn&&v!==Nn&&!A&&i.convert(v)!==n.getParameter(n.IMPLEMENTATION_COLOR_READ_TYPE))}function l(v){if(v==="highp"){if(n.getShaderPrecisionFormat(n.VERTEX_SHADER,n.HIGH_FLOAT).precision>0&&n.getShaderPrecisionFormat(n.FRAGMENT_SHADER,n.HIGH_FLOAT).precision>0)return"highp";v="mediump"}return v==="mediump"&&n.getShaderPrecisionFormat(n.VERTEX_SHADER,n.MEDIUM_FLOAT).precision>0&&n.getShaderPrecisionFormat(n.FRAGMENT_SHADER,n.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=t.precision!==void 0?t.precision:"highp",h=l(c);h!==c&&(Ie("WebGLRenderer:",c,"not supported, using",h,"instead."),c=h);let u=t.reversedDepthBuffer===!0&&e.has("EXT_clip_control"),f=t.logarithmicDepthBuffer===!0&&u===!1;t.reversedDepthBuffer===!0&&u===!1&&Ie("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer."),t.logarithmicDepthBuffer===!0&&u===!0&&Ie("WebGLRenderer: Logarithmic depth buffer is ignored when reversed depth buffer is enabled.");let d=n.getParameter(n.MAX_TEXTURE_IMAGE_UNITS),p=n.getParameter(n.MAX_VERTEX_TEXTURE_IMAGE_UNITS),y=n.getParameter(n.MAX_TEXTURE_SIZE),m=n.getParameter(n.MAX_CUBE_MAP_TEXTURE_SIZE),g=n.getParameter(n.MAX_VERTEX_ATTRIBS),b=n.getParameter(n.MAX_VERTEX_UNIFORM_VECTORS),_=n.getParameter(n.MAX_VARYING_VECTORS),x=n.getParameter(n.MAX_FRAGMENT_UNIFORM_VECTORS),M=n.getParameter(n.MAX_SAMPLES),E=n.getParameter(n.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:s,getMaxPrecision:l,textureFormatReadable:o,textureTypeReadable:a,precision:c,logarithmicDepthBuffer:f,reversedDepthBuffer:u,maxTextures:d,maxVertexTextures:p,maxTextureSize:y,maxCubemapSize:m,maxAttributes:g,maxVertexUniforms:b,maxVaryings:_,maxFragmentUniforms:x,maxSamples:M,samples:E}}function BS(n){let e=this,t=null,i=0,r=!1,s=!1,o=new Rn,a=new Ue,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(u,f){let d=u.length!==0||f||i!==0||r;return r=f,i=u.length,d},this.beginShadows=function(){s=!0,h(null)},this.endShadows=function(){s=!1},this.setGlobalState=function(u,f){t=h(u,f,0)},this.setState=function(u,f,d){let p=u.clippingPlanes,y=u.clipIntersection,m=u.clipShadows,g=n.get(u);if(!r||p===null||p.length===0||s&&!m)s?h(null):c();else{let b=s?0:i,_=b*4,x=g.clippingState||null;l.value=x,x=h(p,f,_,d);for(let M=0;M!==_;++M)x[M]=t[M];g.clippingState=x,this.numIntersection=y?this.numPlanes:0,this.numPlanes+=b}};function c(){l.value!==t&&(l.value=t,l.needsUpdate=i>0),e.numPlanes=i,e.numIntersection=0}function h(u,f,d,p){let y=u!==null?u.length:0,m=null;if(y!==0){if(m=l.value,p!==!0||m===null){let g=d+y*4,b=f.matrixWorldInverse;a.getNormalMatrix(b),(m===null||m.length<g)&&(m=new Float32Array(g));for(let _=0,x=d;_!==y;++_,x+=4)o.copy(u[_]).applyMatrix4(b,a),o.normal.toArray(m,x),m[x+3]=o.constant}l.value=m,l.needsUpdate=!0}return e.numPlanes=y,e.numIntersection=0,m}}var oa=class extends mn{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let i={width:e,height:e,depth:1},r=[i,i,i,i,i,i];this.texture=new Vo(r),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let i={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},r=new Ds(5,5,5),s=new Pn({name:"CubemapFromEquirect",uniforms:$r(i.uniforms),vertexShader:i.vertexShader,fragmentShader:i.fragmentShader,side:gn,blending:Ni});s.uniforms.tEquirect.value=t;let o=new Jt(r,s),a=t.minFilter;return t.minFilter===Oi&&(t.minFilter=pn),new Ns(1,10,this).update(e,o),t.minFilter=a,o.geometry.dispose(),o.material.dispose(),this}clear(e,t=!0,i=!0,r=!0){let s=e.getRenderTarget();for(let o=0;o<6;o++)e.setRenderTarget(this,o),e.clear(t,i,r);e.setRenderTarget(s)}},gg=256,zS=3,HS=20,Bg=256,zg=16,VS=3,GS=new O,WS=new je,ih=class n{constructor(e){this._renderer=e,this._cubeSize=0,this._sourceTarget=null,this._cubeCamera=new Ns(1,10,null),this._boxMesh=new Jt(new Ds(5,5,5),null),this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null,this._integrationMaterial=null}fromScene(e,t=0,i=.1,r=100,s={}){let{size:o=256,position:a=GS}=s,l=this._renderer;this._setSize(o);let c=this._allocateTarget(),h=this._getSourceTarget(!0);t>0&&(h.texture.mipmapsAutoUpdate=!1);let u=l.autoClear,f=l.autoClearColor,d=l.autoClearDepth,p=l.autoClearStencil,y=e.background;l.autoClear=!0,l.autoClearColor=!0,l.autoClearDepth=!0,l.autoClearStencil=!0,y===null&&(e.background=l.getClearColor(WS));let m=new Ns(i,r,h);return m.position.copy(a),m.update(l,e),l.autoClear=u,l.autoClearColor=f,l.autoClearDepth=d,l.autoClearStencil=p,e.background=y,t>0&&(h.texture.mipmapsAutoUpdate=!0,this._blur(c,t)),this._applyPMREM(c),c}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=xg(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=bg(),this._compileMaterial(this._equirectMaterial))}dispose(){this._sourceTarget!==null&&this._sourceTarget.dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._integrationMaterial!==null&&this._integrationMaterial.dispose(),this._boxMesh.geometry.dispose()}static lodToRoughness(e,t){return t>0?1-Math.sqrt(1-e/t):0}_setSize(e){this._cubeSize=Math.max(gg,Cd(e))}_fromTexture(e,t){e.mapping===Gr||e.mapping===Bs?this._setSize(e.image.length===0?gg:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4);let i=t||this._allocateTarget();return this._textureToCubemap(e),this._applyPMREM(i),i}_allocateTarget(){let e=this._cubeSize,t=yg(e,!1,!1),i=Math.log2(e)-zS;for(let r=0;r<=i;r++)t.texture.mipmaps.push({width:e>>r,height:e>>r});return t.texture.name="PMREM",t.texture.isPMREMTexture=!0,t}_getSourceTarget(e=!1){let t=this._cubeSize,i=this._sourceTarget;return(i===null||i.width!==t||e&&i.depthBuffer===!1)&&(i!==null&&i.dispose(),this._sourceTarget=yg(t,!0,e)),this._sourceTarget}_compileMaterial(e){this._boxMesh.material=e,this._renderer.compile(this._boxMesh,this._cubeCamera.children[0])}_renderCube(e,t,i){let r=this._boxMesh,s=this._cubeCamera;r.material=i,s.renderTarget=e,s.activeMipmapLevel=t;let o=e.width>>t;e.viewport.set(0,0,o,o),s.update(this._renderer,r),e.viewport.set(0,0,e.width,e.height)}_textureToCubemap(e){let t;e.mapping===Gr||e.mapping===Bs?(this._cubemapMaterial===null&&(this._cubemapMaterial=xg()),t=this._cubemapMaterial,t.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):(this._equirectMaterial===null&&(this._equirectMaterial=bg()),t=this._equirectMaterial),t.uniforms.envMap.value=e,this._renderCube(this._getSourceTarget(),0,t)}_applyPMREM(e){this._ggxMaterial===null&&(this._ggxMaterial=$S(),this._integrationMaterial=jS());let t=this._cubeSize,i=e.texture.mipmaps.length-1,r=this._ggxMaterial.uniforms;r.envMap.value=this._sourceTarget.texture;let s=this._integrationMaterial.uniforms;s.envMap.value=this._sourceTarget.texture,s.sourceLod.value=Math.log2(t/zg);for(let o=0;o<=i;o++){let a=n.lodToRoughness(o,i);if(o>i-VS)s.roughness.value=a,this._renderCube(e,o,this._integrationMaterial);else{let l=a>0?Math.log2(t)+.5*Math.log2(6/(Bg*Math.pow(a,4)))+.5:0;r.roughness.value=a,r.lodBias.value=l,this._renderCube(e,o,this._ggxMaterial)}}}_blur(e,t){this._blurMaterial===null&&(this._blurMaterial=XS());let i=this._blurMaterial,r=i.uniforms,s=this._sourceTarget;r.sigma.value=Math.min(t,Math.PI)/Math.SQRT2,r.envMap.value=s.texture,this._renderCube(e,0,i),r.envMap.value=e.texture,this._renderCube(s,0,i)}};function yg(n,e,t){return new oa(n,{minFilter:Oi,generateMipmaps:e,type:ii,colorSpace:Or,depthBuffer:t})}function aa(n,e,t){return new Pn({name:n,uniforms:e,vertexShader:Xe.cube_vert,fragmentShader:t,side:gn,blending:Ni,depthTest:!1,depthWrite:!1})}function $S(){return aa("PMREMGGXConvolution",{envMap:{value:null},roughness:{value:0},lodBias:{value:0}},`

		#define GGX_SAMPLES ${Bg}u

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float roughness;
		uniform float lodBias;

		#include <common>

		// Van der Corput radical inverse
		float radicalInverse_VdC( uint bits ) {

			bits = ( bits << 16u ) | ( bits >> 16u );
			bits = ( ( bits & 0x55555555u ) << 1u ) | ( ( bits & 0xAAAAAAAAu ) >> 1u );
			bits = ( ( bits & 0x33333333u ) << 2u ) | ( ( bits & 0xCCCCCCCCu ) >> 2u );
			bits = ( ( bits & 0x0F0F0F0Fu ) << 4u ) | ( ( bits & 0xF0F0F0F0u ) >> 4u );
			bits = ( ( bits & 0x00FF00FFu ) << 8u ) | ( ( bits & 0xFF00FF00u ) >> 8u );
			return float( bits ) * 2.3283064365386963e-10; // / 0x100000000

		}

		// Hammersley sequence
		vec2 hammersley( uint i, uint N ) {

			return vec2( float( i ) / float( N ), radicalInverse_VdC( i ) );

		}

		void main() {

			vec3 N = normalize( vWorldDirection );

			// For very low roughness, just sample the environment directly
			if ( roughness < 0.001 ) {

				gl_FragColor = vec4( textureLod( envMap, N, 0.0 ).rgb, 1.0 );
				return;

			}

			float alpha = roughness * roughness;
			float alpha2 = alpha * alpha;

			// Tangent space basis for VNDF sampling
			vec3 up = abs( N.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
			vec3 tangent = normalize( cross( up, N ) );
			vec3 bitangent = cross( N, tangent );

			vec3 prefilteredColor = vec3( 0.0 );
			float totalWeight = 0.0;

			for ( uint i = 0u; i < GGX_SAMPLES; i ++ ) {

				vec2 Xi = hammersley( i, GGX_SAMPLES );

				// With V = N, sample the reflected direction directly.
				float invQ = 1.0 / ( 1.0 - Xi.x + alpha2 * Xi.x );
				float NdotL = ( 1.0 - Xi.x - alpha2 * Xi.x ) * invQ;

				if ( NdotL > 0.0 ) {

					float phi = 2.0 * PI * Xi.y;
					float sinTheta = 2.0 * alpha * sqrt( Xi.x * ( 1.0 - Xi.x ) ) * invQ;
					vec3 L = N * NdotL + ( tangent * cos( phi ) + bitangent * sin( phi ) ) * sinTheta;

					// Match the source mip to the sample's solid angle. The terms
					// independent of the sample are precomputed in lodBias.
					float d = alpha2 * invQ;
					float lod = max( log2( d ) + lodBias, 0.0 );

					// Weight by NdotL for the split-sum approximation
					prefilteredColor += textureLod( envMap, L, lod ).rgb * NdotL;
					totalWeight += NdotL;

				}

			}

			gl_FragColor = vec4( prefilteredColor / totalWeight, 1.0 );

		}
	`)}function jS(){return aa("PMREMGGXIntegration",{envMap:{value:null},roughness:{value:0},sourceLod:{value:0},sourceSize:{value:zg}},`

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float roughness;
		uniform float sourceLod;
		uniform int sourceSize;

		void main() {

			vec3 N = normalize( vWorldDirection );

			float alpha = roughness * roughness;
			float alpha2 = alpha * alpha;

			float texelSize = 2.0 / float( sourceSize );

			vec3 prefilteredColor = vec3( 0.0 );
			float totalWeight = 0.0;

			// Pair opposite texels: only the one in N's hemisphere contributes.
			for ( int face = 0; face < 3; face ++ ) {

				for ( int y = 0; y < sourceSize; y ++ ) {

					for ( int x = 0; x < sourceSize; x ++ ) {

						vec2 uv = ( vec2( x, y ) + 0.5 ) * texelSize - 1.0;
						vec3 texelDirection = face == 0 ? vec3( 1.0, uv ) : ( face == 1 ? vec3( uv.x, 1.0, uv.y ) : vec3( uv, 1.0 ) );

						float invDistance = inversesqrt( 1.0 + dot( uv, uv ) );
						float NdotL = dot( N, texelDirection );
						texelDirection *= NdotL < 0.0 ? - 1.0 : 1.0;
						NdotL = abs( NdotL ) * invDistance;

						// With V = N, NdotH squared is ( 1 + NdotL ) / 2. Common factors
						// in the GGX distribution and texel solid angle cancel when normalized.
						float d = 1.0 + alpha2 + ( alpha2 - 1.0 ) * NdotL;
						float weight = NdotL * invDistance * invDistance * invDistance / ( d * d );

						prefilteredColor += textureLod( envMap, texelDirection, sourceLod ).rgb * weight;
						totalWeight += weight;

					}

				}

			}

			gl_FragColor = vec4( prefilteredColor / totalWeight, 1.0 );

		}
	`)}function XS(){return aa("PMREMSphericalGaussianBlur",{envMap:{value:null},sigma:{value:0}},`

		#define SAMPLES ${HS}
		#define GOLDEN_ANGLE 2.39996322973

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float sigma;

		#include <common>

		void main() {

			vec3 outputDirection = normalize( vWorldDirection );

			vec3 up = abs( outputDirection.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
			vec3 tangent = normalize( cross( up, outputDirection ) );
			vec3 bitangent = cross( outputDirection, tangent );

			// Truncate the kernel at three standard deviations or at the antipode.
			float thetaMax = min( 3.0 * sigma, PI );
			float truncation = 1.0 - exp( - 0.5 * thetaMax * thetaMax / ( sigma * sigma ) );

			vec3 accumColor = vec3( 0.0 );
			float accumWeight = 0.0;

			for ( int i = 0; i < SAMPLES; i ++ ) {

				// Stratified inverse-CDF sampling of the Gaussian, placed on a golden-angle spiral.
				float stratum = ( float( i ) + 0.5 ) / float( SAMPLES );
				float theta = sigma * sqrt( - 2.0 * log( 1.0 - stratum * truncation ) );
				float phi = float( i ) * GOLDEN_ANGLE;

				vec3 offset = cos( phi ) * tangent + sin( phi ) * bitangent;
				vec3 sampleDirection = cos( theta ) * outputDirection + sin( theta ) * offset;

				// Correct the planar sample density to solid angle.
				float weight = sin( theta ) / theta;

				accumColor += weight * textureLod( envMap, sampleDirection, 0.0 ).rgb;
				accumWeight += weight;

			}

			gl_FragColor = vec4( accumColor / accumWeight, 1.0 );

		}
	`)}function bg(){return aa("PMREMEquirectangularToCubemap",{envMap:{value:null}},`

		varying vec3 vWorldDirection;

		uniform sampler2D envMap;

		#include <common>

		void main() {

			// Average four subpixel samples to preserve small, bright features.
			vec3 direction = normalize( vWorldDirection );
			vec3 dx = dFdx( direction ) * 0.25;
			vec3 dy = dFdy( direction ) * 0.25;

			vec3 color = textureLod( envMap, equirectUv( normalize( direction - dx - dy ) ), 0.0 ).rgb;
			color += textureLod( envMap, equirectUv( normalize( direction + dx - dy ) ), 0.0 ).rgb;
			color += textureLod( envMap, equirectUv( normalize( direction - dx + dy ) ), 0.0 ).rgb;
			color += textureLod( envMap, equirectUv( normalize( direction + dx + dy ) ), 0.0 ).rgb;
			gl_FragColor = vec4( color * 0.25, 1.0 );

		}
	`)}function xg(){return aa("PMREMCubemapToCubemap",{envMap:{value:null},flipEnvMap:{value:-1}},`

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float flipEnvMap;

		void main() {

			gl_FragColor = vec4( textureCube( envMap, vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) ).rgb, 1.0 );

		}
	`)}function qS(n){let e=new WeakMap,t=new WeakMap,i=null;function r(f,d=!1){return f==null?null:d?o(f):s(f)}function s(f){if(f&&f.isTexture){let d=f.mapping;if(d===mc||d===gc)if(e.has(f)){let p=e.get(f).texture;return a(p,f.mapping)}else{let p=f.image;if(p&&p.height>0){let y=new oa(p.height);return y.fromEquirectangularTexture(n,f),e.set(f,y),f.addEventListener("dispose",c),a(y.texture,f.mapping)}else return null}}return f}function o(f){if(f&&f.isTexture&&f.isPMREMTexture!==!0){let d=f.mapping,p=d===mc||d===gc,y=d===Gr||d===Bs;if(p||y){let m=t.get(f),g=m!==void 0?m.texture.pmremVersion:0;if(f.isRenderTargetTexture&&f.pmremVersion!==g)return i===null&&(i=new ih(n)),m=p?i.fromEquirectangular(f,m):i.fromCubemap(f,m),m.texture.pmremVersion=f.pmremVersion,t.set(f,m),m.texture;if(m!==void 0)return m.texture;{let b=f.image;return p&&b&&b.height>0||y&&b&&l(b)?(i===null&&(i=new ih(n)),m=p?i.fromEquirectangular(f):i.fromCubemap(f),m.texture.pmremVersion=f.pmremVersion,t.set(f,m),f.addEventListener("dispose",h),m.texture):null}}}return f}function a(f,d){return d===mc?f.mapping=Gr:d===gc&&(f.mapping=Bs),f}function l(f){let d=0,p=6;for(let y=0;y<p;y++)f[y]!==void 0&&d++;return d===p}function c(f){let d=f.target;d.removeEventListener("dispose",c);let p=e.get(d);p!==void 0&&(e.delete(d),p.dispose())}function h(f){let d=f.target;d.removeEventListener("dispose",h);let p=t.get(d);p!==void 0&&(t.delete(d),p.dispose())}function u(){e=new WeakMap,t=new WeakMap,i!==null&&(i.dispose(),i=null)}return{get:r,dispose:u}}function YS(n){let e={};function t(i){if(e[i]!==void 0)return e[i];let r=n.getExtension(i);return e[i]=r,r}return{has:function(i){return t(i)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(i){let r=t(i);return r===null&&Po("WebGLRenderer: "+i+" extension not supported."),r}}}function JS(n,e,t,i){let r={},s=new WeakMap,o=new FinalizationRegistry(p=>delete r[p]);function a(p){l(p.target)}function l(p){p.index!==null&&e.remove(p.index);for(let m in p.attributes)e.remove(p.attributes[m]);p.removeEventListener("dispose",a),delete r[p.id],o.unregister(p);let y=s.get(p);y&&(e.remove(y),s.delete(p)),i.releaseStatesOfGeometry(p),p.isInstancedBufferGeometry===!0&&delete p._maxInstanceCount,t.memory.geometries--}function c(p,y){return r[y.id]!==void 0||(y.addEventListener("dispose",a),r[y.id]=new WeakRef(y),o.register(y,y.id,y),t.memory.geometries++),y}function h(p){let y=p.attributes;for(let m in y)e.update(y[m],n.ARRAY_BUFFER)}function u(p){let y=p.index,m=p.attributes.position,g=0;if(m===void 0)return;let b=y!==null?y.array.length:m.array.length/3-1,_=m.count>=65535?Ho:zo,x=new _(Math.ceil(b/3)*6,1),M=x.array;if(y!==null){let v=y.array;g=y.version;for(let A=0,L=0;A<b;A+=3){let C=v[A+0],k=v[A+1],H=v[A+2];M[L++]=C,M[L++]=k,M[L++]=k,M[L++]=H,M[L++]=H,M[L++]=C}}else{g=m.version;for(let v=0,A=0;v<b;v+=3){let L=v+0,C=v+1,k=v+2;M[A++]=L,M[A++]=C,M[A++]=C,M[A++]=k,M[A++]=k,M[A++]=L}}x.version=g;let E=s.get(p);E&&e.remove(E),s.set(p,x)}function f(p){let y=s.get(p);if(y){let m=p.index;m!==null&&y.version<m.version&&u(p)}else u(p);return s.get(p)}function d(){for(let p in r){let y=r[p].deref();y!==void 0&&l(y)}}return{get:c,update:h,getWireframeAttribute:f,dispose:d}}function ZS(n,e,t){let i;function r(u){i=u}let s,o;function a(u){s=u.type,o=u.bytesPerElement}function l(u,f){n.drawElements(i,f,s,u*o),t.update(f,i,1)}function c(u,f,d){d!==0&&(n.drawElementsInstanced(i,f,s,u*o,d),t.update(f,i,d))}function h(u,f,d){if(d===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(i,f,0,s,u,0,d);let y=0;for(let m=0;m<d;m++)y+=f[m];t.update(y,i,1)}this.setMode=r,this.setIndex=a,this.render=l,this.renderInstances=c,this.renderMultiDraw=h}function KS(n){let e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function i(s,o,a){switch(t.calls++,o){case n.TRIANGLES:t.triangles+=a*(s/3);break;case n.LINES:t.lines+=a*(s/2);break;case n.LINE_STRIP:t.lines+=a*(s-1);break;case n.LINE_LOOP:t.lines+=a*s;break;case n.POINTS:t.points+=a*s;break;default:Fe("WebGLInfo: Unknown draw mode:",o);break}}function r(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:r,update:i}}function QS(n,e,t){let i=new WeakMap,r=new at;function s(o,a,l){let c=o.morphTargetInfluences,h=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,u=h!==void 0?h.length:0,f=i.get(a);if(f===void 0||f.count!==u){let L=function(){v.dispose(),i.delete(a),a.removeEventListener("dispose",L)};f!==void 0&&f.texture.dispose();let d=a.morphAttributes.position!==void 0,p=a.morphAttributes.normal!==void 0,y=a.morphAttributes.color!==void 0,m=a.morphAttributes.position||[],g=a.morphAttributes.normal||[],b=a.morphAttributes.color||[],_=0;d===!0&&(_=1),p===!0&&(_=2),y===!0&&(_=3);let x=a.attributes.position.count*_,M=1;x>e.maxTextureSize&&(M=Math.ceil(x/e.maxTextureSize),x=e.maxTextureSize);let E=new Float32Array(x*M*4*u),v=new Uo(E,x,M,u);v.type=Nn,v.needsUpdate=!0;let A=_*4;for(let C=0;C<u;C++){let k=m[C],H=g[C],j=b[C],I=x*M*4*C;for(let V=0;V<k.count;V++){let G=V*A;d===!0&&(r.fromBufferAttribute(k,V),E[I+G+0]=r.x,E[I+G+1]=r.y,E[I+G+2]=r.z,E[I+G+3]=0),p===!0&&(r.fromBufferAttribute(H,V),E[I+G+4]=r.x,E[I+G+5]=r.y,E[I+G+6]=r.z,E[I+G+7]=0),y===!0&&(r.fromBufferAttribute(j,V),E[I+G+8]=r.x,E[I+G+9]=r.y,E[I+G+10]=r.z,E[I+G+11]=j.itemSize===4?r.w:1)}}f={count:u,texture:v,size:new Pe(x,M)},i.set(a,f),a.addEventListener("dispose",L)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)l.getUniforms().setValue(n,"morphTexture",o.morphTexture,t);else{let d=0;for(let y=0;y<c.length;y++)d+=c[y];let p=a.morphTargetsRelative?1:1-d;l.getUniforms().setValue(n,"morphTargetBaseInfluence",p),l.getUniforms().setValue(n,"morphTargetInfluences",c)}l.getUniforms().setValue(n,"morphTargetsTexture",f.texture,t),l.getUniforms().setValue(n,"morphTargetsTextureSize",f.size)}return{update:s}}function eM(n,e,t,i,r){let s=new WeakMap;function o(c){let h=r.render.frame,u=c.geometry,f=e.get(c,u);if(s.get(f)!==h&&(e.update(f),s.set(f,h)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),s.get(c)!==h&&(t.update(c.instanceMatrix,n.ARRAY_BUFFER),c.instanceColor!==null&&t.update(c.instanceColor,n.ARRAY_BUFFER),s.set(c,h))),c.isSkinnedMesh){let d=c.skeleton;s.get(d)!==h&&(d.update(),s.set(d,h))}return f}function a(){s=new WeakMap}function l(c){let h=c.target;h.removeEventListener("dispose",l),i.releaseStatesOfObject(h),t.remove(h.instanceMatrix),h.instanceColor!==null&&t.remove(h.instanceColor)}return{update:o,dispose:a}}var tM={[od]:"LINEAR_TONE_MAPPING",[ad]:"REINHARD_TONE_MAPPING",[ld]:"CINEON_TONE_MAPPING",[cd]:"ACES_FILMIC_TONE_MAPPING",[ud]:"AGX_TONE_MAPPING",[dd]:"NEUTRAL_TONE_MAPPING",[hd]:"CUSTOM_TONE_MAPPING"};function nM(n,e,t,i,r,s){let o=new mn(e,t,{type:n,depthBuffer:r,stencilBuffer:s,samples:i?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1}),a=null,l=null,c=null,h=new vt;h.setAttribute("position",new Ut([-1,3,0,-1,-1,0,3,-1,0],3)),h.setAttribute("uv",new Ut([0,2,0,0,2,0],2));let u=new tc({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),f=new Jt(h,u),d=new Ln(-1,1,1,-1,0,1),p=null,y=null,m=!1,g,b=null,_=[],x=!1;this.setSize=function(M,E){o.setSize(M,E),a!==null&&a.setSize(M,E),l!==null&&l.setSize(M,E);for(let v=0;v<_.length;v++){let A=_[v];A.setSize&&A.setSize(M,E)}},this.setEffects=function(M){_=M,x=_.length>0&&_[0].isRenderPass===!0;let E=o.width,v=o.height;_.length>0&&a===null&&(a=new mn(E,v,{type:ii,depthBuffer:!1,stencilBuffer:!1}),l=new mn(E,v,{type:ii,depthBuffer:!1,stencilBuffer:!1}));let A=r===!0&&_.some(L=>L.needsDepthTexture===!0);A!==(o.depthTexture!==null)&&(A===!0&&c===null&&(c=new ki(E,v),s===!0&&(c.format=Fi,c.type=Wr)),o.dispose(),o.depthTexture=A?c:null,o.resolveDepthBuffer=A,o.storeMultisampledDepthBuffer=A);for(let L=0;L<_.length;L++){let C=_[L];C.setSize&&C.setSize(E,v),A&&C.needsDepthTexture===!0&&C.setDepthTexture&&C.setDepthTexture(c)}},this.begin=function(M,E){if(m||M.toneMapping===gi&&_.length===0)return!1;if(b=E,E!==null){let v=E.width,A=E.height;(o.width!==v||o.height!==A)&&this.setSize(v,A)}return x===!1&&M.setRenderTarget(o),g=M.toneMapping,M.toneMapping=gi,!0},this.hasRenderPass=function(){return x},this.end=function(M,E){M.toneMapping=g,m=!0;let v=o,A=a;for(let L=0;L<_.length;L++){let C=_[L];C.enabled!==!1&&(C.render(M,A,v,E),C.needsSwap!==!1&&(v=A,A=A===a?l:a))}if(p!==M.outputColorSpace||y!==M.toneMapping){p=M.outputColorSpace,y=M.toneMapping,u.defines={},qe.getTransfer(p)===ot&&(u.defines.SRGB_TRANSFER="");let L=tM[y];L&&(u.defines[L]=""),u.needsUpdate=!0}u.uniforms.tDiffuse.value=v.texture,M.setRenderTarget(b),M.render(f,d),b=null,m=!1},this.isCompositing=function(){return m},this.dispose=function(){o.dispose(),a!==null&&a.dispose(),l!==null&&l.dispose(),h.dispose(),u.dispose()}}var Hg=new tn,Vg=new ki(1,1),Gg=new Go(1),Wg=new Uo,$g=new Jl,jg=new Vo,vg=[],_g=[],Sg=new Float32Array(16),Mg=new Float32Array(9),wg=new Float32Array(4);function Vs(n,e,t){let i=n[0];if(i<=0||i>0)return n;let r=e*t,s=vg[r];if(s===void 0&&(s=new Float32Array(r),vg[r]=s),e!==0){i.toArray(s,0);for(let o=1,a=0;o!==e;++o)a+=t,n[o].toArray(s,a)}return s}function Bt(n,e){if(n.length!==e.length)return!1;for(let t=0,i=n.length;t<i;t++)if(n[t]!==e[t])return!1;return!0}function zt(n,e){for(let t=0,i=e.length;t<i;t++)n[t]=e[t]}function sh(n,e){let t=_g[e];t===void 0&&(t=new Int32Array(e),_g[e]=t);for(let i=0;i!==e;++i)t[i]=n.allocateTextureUnit();return t}function iM(n,e){let t=this.cache;t[0]!==e&&(n.uniform1f(this.addr,e),t[0]=e)}function rM(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(n.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Bt(t,e))return;n.uniform2fv(this.addr,e),zt(t,e)}}function sM(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(n.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(n.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(Bt(t,e))return;n.uniform3fv(this.addr,e),zt(t,e)}}function oM(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(n.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Bt(t,e))return;n.uniform4fv(this.addr,e),zt(t,e)}}function aM(n,e){let t=this.cache,i=e.elements;if(i===void 0){if(Bt(t,e))return;n.uniformMatrix2fv(this.addr,!1,e),zt(t,e)}else{if(Bt(t,i))return;wg.set(i),n.uniformMatrix2fv(this.addr,!1,wg),zt(t,i)}}function lM(n,e){let t=this.cache,i=e.elements;if(i===void 0){if(Bt(t,e))return;n.uniformMatrix3fv(this.addr,!1,e),zt(t,e)}else{if(Bt(t,i))return;Mg.set(i),n.uniformMatrix3fv(this.addr,!1,Mg),zt(t,i)}}function cM(n,e){let t=this.cache,i=e.elements;if(i===void 0){if(Bt(t,e))return;n.uniformMatrix4fv(this.addr,!1,e),zt(t,e)}else{if(Bt(t,i))return;Sg.set(i),n.uniformMatrix4fv(this.addr,!1,Sg),zt(t,i)}}function hM(n,e){let t=this.cache;t[0]!==e&&(n.uniform1i(this.addr,e),t[0]=e)}function uM(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(n.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Bt(t,e))return;n.uniform2iv(this.addr,e),zt(t,e)}}function dM(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(n.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Bt(t,e))return;n.uniform3iv(this.addr,e),zt(t,e)}}function fM(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(n.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Bt(t,e))return;n.uniform4iv(this.addr,e),zt(t,e)}}function pM(n,e){let t=this.cache;t[0]!==e&&(n.uniform1ui(this.addr,e),t[0]=e)}function mM(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(n.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Bt(t,e))return;n.uniform2uiv(this.addr,e),zt(t,e)}}function gM(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(n.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Bt(t,e))return;n.uniform3uiv(this.addr,e),zt(t,e)}}function yM(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(n.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Bt(t,e))return;n.uniform4uiv(this.addr,e),zt(t,e)}}function oh(n){return n.version===0&&(n.compareFunction=Td,n.needsUpdate=!0),n}function bM(n,e,t){let i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r);let s;this.type===n.SAMPLER_2D_SHADOW?s=oh(Vg):s=Hg,t.setTexture2D(e||s,r)}function xM(n,e,t){let i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r),t.setTexture3D(e||$g,r)}function vM(n,e,t){let i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r);let s;this.type===n.SAMPLER_CUBE_SHADOW?s=oh(Gg):s=jg,t.setTextureCube(e||s,r)}function _M(n,e,t){let i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r),t.setTexture2DArray(e||Wg,r)}function SM(n){switch(n){case 5126:return iM;case 35664:return rM;case 35665:return sM;case 35666:return oM;case 35674:return aM;case 35675:return lM;case 35676:return cM;case 5124:case 35670:return hM;case 35667:case 35671:return uM;case 35668:case 35672:return dM;case 35669:case 35673:return fM;case 5125:return pM;case 36294:return mM;case 36295:return gM;case 36296:return yM;case 35678:case 36198:case 36298:case 36306:case 35682:return bM;case 35679:case 36299:case 36307:return xM;case 35680:case 36300:case 36308:case 36293:return vM;case 36289:case 36303:case 36311:case 36292:return _M}}function MM(n,e){n.uniform1fv(this.addr,e)}function wM(n,e){let t=Vs(e,this.size,2);n.uniform2fv(this.addr,t)}function EM(n,e){let t=Vs(e,this.size,3);n.uniform3fv(this.addr,t)}function TM(n,e){let t=Vs(e,this.size,4);n.uniform4fv(this.addr,t)}function AM(n,e){let t=Vs(e,this.size,4);n.uniformMatrix2fv(this.addr,!1,t)}function RM(n,e){let t=Vs(e,this.size,9);n.uniformMatrix3fv(this.addr,!1,t)}function CM(n,e){let t=Vs(e,this.size,16);n.uniformMatrix4fv(this.addr,!1,t)}function PM(n,e){n.uniform1iv(this.addr,e)}function IM(n,e){n.uniform2iv(this.addr,e)}function LM(n,e){n.uniform3iv(this.addr,e)}function DM(n,e){n.uniform4iv(this.addr,e)}function kM(n,e){n.uniform1uiv(this.addr,e)}function NM(n,e){n.uniform2uiv(this.addr,e)}function OM(n,e){n.uniform3uiv(this.addr,e)}function FM(n,e){n.uniform4uiv(this.addr,e)}function UM(n,e,t){let i=this.cache,r=e.length,s=sh(t,r);Bt(i,s)||(n.uniform1iv(this.addr,s),zt(i,s));let o;this.type===n.SAMPLER_2D_SHADOW?o=oh(Vg):o=Hg;for(let a=0;a!==r;++a)t.setTexture2D(e[a]||o,s[a])}function BM(n,e,t){let i=this.cache,r=e.length,s=sh(t,r);Bt(i,s)||(n.uniform1iv(this.addr,s),zt(i,s));for(let o=0;o!==r;++o)t.setTexture3D(e[o]||$g,s[o])}function zM(n,e,t){let i=this.cache,r=e.length,s=sh(t,r);Bt(i,s)||(n.uniform1iv(this.addr,s),zt(i,s));let o;this.type===n.SAMPLER_CUBE_SHADOW?o=oh(Gg):o=jg;for(let a=0;a!==r;++a)t.setTextureCube(e[a]||o,s[a])}function HM(n,e,t){let i=this.cache,r=e.length,s=sh(t,r);Bt(i,s)||(n.uniform1iv(this.addr,s),zt(i,s));for(let o=0;o!==r;++o)t.setTexture2DArray(e[o]||Wg,s[o])}function VM(n){switch(n){case 5126:return MM;case 35664:return wM;case 35665:return EM;case 35666:return TM;case 35674:return AM;case 35675:return RM;case 35676:return CM;case 5124:case 35670:return PM;case 35667:case 35671:return IM;case 35668:case 35672:return LM;case 35669:case 35673:return DM;case 5125:return kM;case 36294:return NM;case 36295:return OM;case 36296:return FM;case 35678:case 36198:case 36298:case 36306:case 35682:return UM;case 35679:case 36299:case 36307:return BM;case 35680:case 36300:case 36308:case 36293:return zM;case 36289:case 36303:case 36311:case 36292:return HM}}var Bd=class{constructor(e,t,i){this.id=e,this.addr=i,this.cache=[],this.type=t.type,this.setValue=SM(t.type)}},zd=class{constructor(e,t,i){this.id=e,this.addr=i,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=VM(t.type)}},Hd=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,i){let r=this.seq;for(let s=0,o=r.length;s!==o;++s){let a=r[s];a.setValue(e,t[a.id],i)}}},Fd=/(\w+)(\])?(\[|\.)?/g;function Eg(n,e){n.seq.push(e),n.map[e.id]=e}function GM(n,e,t){let i=n.name,r=i.length;for(Fd.lastIndex=0;;){let s=Fd.exec(i),o=Fd.lastIndex,a=s[1],l=s[2]==="]",c=s[3];if(l&&(a=a|0),c===void 0||c==="["&&o+2===r){Eg(t,c===void 0?new Bd(a,n,e):new zd(a,n,e));break}else{let u=t.map[a];u===void 0&&(u=new Hd(a),Eg(t,u)),t=u}}}var Hs=class{constructor(e,t){this.seq=[],this.map={};let i=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let o=0;o<i;++o){let a=e.getActiveUniform(t,o),l=e.getUniformLocation(t,a.name);GM(a,l,this)}let r=[],s=[];for(let o of this.seq)o.type===e.SAMPLER_2D_SHADOW||o.type===e.SAMPLER_CUBE_SHADOW||o.type===e.SAMPLER_2D_ARRAY_SHADOW?r.push(o):s.push(o);r.length>0&&(this.seq=r.concat(s))}setValue(e,t,i,r){let s=this.map[t];s!==void 0&&s.setValue(e,i,r)}setOptional(e,t,i){let r=t[i];r!==void 0&&this.setValue(e,i,r)}static upload(e,t,i,r){for(let s=0,o=t.length;s!==o;++s){let a=t[s],l=i[a.id];l.needsUpdate!==!1&&a.setValue(e,l.value,r)}}static seqWithValue(e,t){let i=[];for(let r=0,s=e.length;r!==s;++r){let o=e[r];o.id in t&&i.push(o)}return i}};function Tg(n,e,t){let i=n.createShader(e);return n.shaderSource(i,t),n.compileShader(i),i}var WM=37297,$M=0;function jM(n,e){let t=n.split(`
`),i=[],r=Math.max(e-6,0),s=Math.min(e+6,t.length);for(let o=r;o<s;o++){let a=o+1;i.push(`${a===e?">":" "} ${a}: ${t[o]}`)}return i.join(`
`)}var Ag=new Ue;function XM(n){qe._getMatrix(Ag,qe.workingColorSpace,n);let e=`mat3( ${Ag.elements.map(t=>t.toFixed(4))} )`;switch(qe.getTransfer(n)){case ko:return[e,"LinearTransferOETF"];case ot:return[e,"sRGBTransferOETF"];default:return Ie("WebGLProgram: Unsupported color space: ",n),[e,"LinearTransferOETF"]}}function Rg(n,e,t){let i=n.getShaderParameter(e,n.COMPILE_STATUS),s=(n.getShaderInfoLog(e)||"").trim();if(i&&s==="")return"";let o=/ERROR: 0:(\d+)/.exec(s);if(o){let a=parseInt(o[1]);return t.toUpperCase()+`

`+s+`

`+jM(n.getShaderSource(e),a)}else return s}function qM(n,e){let t=XM(e);return[`vec4 ${n}( vec4 value ) {`,`	return ${t[1]}( vec4( ${t[0]} * value.rgb, value.a ) );`,"}"].join(`
`)}var YM={[od]:"Linear",[ad]:"Reinhard",[ld]:"Cineon",[cd]:"ACESFilmic",[ud]:"AgX",[dd]:"Neutral",[hd]:"Custom"};function JM(n,e){let t=YM[e];return t===void 0?(Ie("WebGLProgram: Unsupported toneMapping:",e),"vec3 "+n+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+n+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}var nh=new O;function ZM(){qe.getLuminanceCoefficients(nh);let n=nh.x.toFixed(4),e=nh.y.toFixed(4),t=nh.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${n}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function KM(n){return[n.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",n.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(sa).join(`
`)}function QM(n){let e=[];for(let t in n){let i=n[t];i!==!1&&e.push("#define "+t+" "+i)}return e.join(`
`)}function ew(n,e){let t={},i=n.getProgramParameter(e,n.ACTIVE_ATTRIBUTES);for(let r=0;r<i;r++){let s=n.getActiveAttrib(e,r),o=s.name,a=1;s.type===n.FLOAT_MAT2&&(a=2),s.type===n.FLOAT_MAT3&&(a=3),s.type===n.FLOAT_MAT4&&(a=4),t[o]={type:s.type,location:n.getAttribLocation(e,o),locationSize:a}}return t}function sa(n){return n!==""}function Cg(n,e){let t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return n.replace(/NUM_SUN_LIGHTS/g,e.numSunLights).replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,e.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows).replace(/NUM_LIGHT_PROBE_GRIDS/g,e.numLightProbeGrids)}function Pg(n,e){return n.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}var tw=/^[ \t]*#include +<([\w\d./]+)>/gm;function Vd(n){return n.replace(tw,nw)}function nw(n,e){let t=Xe[e];if(t===void 0)throw new Error("THREE.WebGLProgram: Can not resolve #include <"+e+">");return Vd(t)}var iw=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Ig(n){return n.replace(iw,rw)}function rw(n,e,t,i){let r="";for(let s=parseInt(e);s<parseInt(t);s++)r+=i.replace(/\[\s*i\s*\]/g,"[ "+s+" ]").replace(/UNROLLED_LOOP_INDEX/g,s);return r}function Lg(n){let e=`precision ${n.precision} float;
	precision ${n.precision} int;
	precision ${n.precision} sampler2D;
	precision ${n.precision} samplerCube;
	precision ${n.precision} sampler3D;
	precision ${n.precision} sampler2DArray;
	precision ${n.precision} sampler2DShadow;
	precision ${n.precision} samplerCubeShadow;
	precision ${n.precision} sampler2DArrayShadow;
	precision ${n.precision} isampler2D;
	precision ${n.precision} isampler3D;
	precision ${n.precision} isamplerCube;
	precision ${n.precision} isampler2DArray;
	precision ${n.precision} usampler2D;
	precision ${n.precision} usampler3D;
	precision ${n.precision} usamplerCube;
	precision ${n.precision} usampler2DArray;
	`;return n.precision==="highp"?e+=`
#define HIGH_PRECISION`:n.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:n.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}var sw={[Yo]:"SHADOWMAP_TYPE_PCF",[Fs]:"SHADOWMAP_TYPE_VSM"};function ow(n){return sw[n.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}var aw={[Bs]:"ENVMAP_MODE_REFRACTION"};function lw(n){return n.envMap===!1?"ENVMAP_MODE_REFLECTION":aw[n.envMapMode]||"ENVMAP_MODE_REFLECTION"}var cw={[sd]:"ENVMAP_BLENDING_MULTIPLY",[Zm]:"ENVMAP_BLENDING_MIX",[Km]:"ENVMAP_BLENDING_ADD"};function hw(n){return n.envMap===!1?"ENVMAP_BLENDING_NONE":cw[n.combine]||"ENVMAP_BLENDING_NONE"}function uw(n,e,t,i){let r=n.getContext(),s=t.defines,o=t.vertexShader,a=t.fragmentShader,l=ow(t),c=t.envMapPMREM===!0?"ENVMAP_TYPE_PMREM":"ENVMAP_TYPE_CUBE",h=lw(t),u=hw(t),f=KM(t),d=QM(s),p=r.createProgram(),y,m,g=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(y=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,d].filter(sa).join(`
`),y.length>0&&(y+=`
`),m=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,d].filter(sa).join(`
`),m.length>0&&(m+=`
`)):(y=[Lg(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,d,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+h:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.diffuseRoughnessMap?"#define USE_DIFFUSE_ROUGHNESSMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.diffuseRoughnessMapUv?"#define DIFFUSE_ROUGHNESSMAP_UV "+t.diffuseRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexNormals?"#define HAS_NORMAL":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(sa).join(`
`),m=[Lg(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,d,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+c:"",t.envMap?"#define "+h:"",t.envMap?"#define "+u:"",t.envMapPMREM?"#define ENVMAP_MAX_LOD "+t.envMapMaxLod+".0":"",t.envMapPMREM?"#define ENVMAP_SIZE "+t.envMapSize+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.diffuseRoughness?"#define USE_DIFFUSE_ROUGHNESS":"",t.diffuseRoughnessMap?"#define USE_DIFFUSE_ROUGHNESSMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.retroreflection?"#define USE_RETROREFLECTION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas||t.batchingColor?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==gi?"#define TONE_MAPPING":"",t.toneMapping!==gi?Xe.tonemapping_pars_fragment:"",t.toneMapping!==gi?JM("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",Xe.colorspace_pars_fragment,qM("linearToOutputTexel",t.outputColorSpace),ZM(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(sa).join(`
`)),o=Vd(o),o=Cg(o,t),o=Pg(o,t),a=Vd(a),a=Cg(a,t),a=Pg(a,t),o=Ig(o),a=Ig(a),t.isRawShaderMaterial!==!0&&(g=`#version 300 es
`,y=[f,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+y,m=["#define varying in",t.glslVersion===ia?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===ia?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+m);let b=g+y+o,_=g+m+a,x=Tg(r,r.VERTEX_SHADER,b),M=Tg(r,r.FRAGMENT_SHADER,_);r.attachShader(p,x),r.attachShader(p,M),t.index0AttributeName!==void 0?r.bindAttribLocation(p,0,t.index0AttributeName):t.hasPositionAttribute===!0&&r.bindAttribLocation(p,0,"position"),r.linkProgram(p);function E(C){if(n.debug.checkShaderErrors){let k=r.getProgramInfoLog(p)||"",H=r.getShaderInfoLog(x)||"",j=r.getShaderInfoLog(M)||"",I=k.trim(),V=H.trim(),G=j.trim(),W=!0,te=!0;if(r.getProgramParameter(p,r.LINK_STATUS)===!1)if(W=!1,typeof n.debug.onShaderError=="function")n.debug.onShaderError(r,p,x,M);else{let X=Rg(r,x,"vertex"),ee=Rg(r,M,"fragment");Fe("WebGLProgram: Shader Error "+r.getError()+" - VALIDATE_STATUS "+r.getProgramParameter(p,r.VALIDATE_STATUS)+`

Material Name: `+C.name+`
Material Type: `+C.type+`

Program Info Log: `+I+`
`+X+`
`+ee)}else I!==""?Ie("WebGLProgram: Program Info Log:",I):(V===""||G==="")&&(te=!1);te&&(C.diagnostics={runnable:W,programLog:I,vertexShader:{log:V,prefix:y},fragmentShader:{log:G,prefix:m}})}r.deleteShader(x),r.deleteShader(M),v=new Hs(r,p),A=ew(r,p)}let v;this.getUniforms=function(){return v===void 0&&E(this),v};let A;this.getAttributes=function(){return A===void 0&&E(this),A};let L=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return L===!1&&(L=r.getProgramParameter(p,WM)),L},this.destroy=function(){i.releaseStatesOfProgram(this),r.deleteProgram(p),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=$M++,this.cacheKey=e,this.usedTimes=1,this.program=p,this.vertexShader=x,this.fragmentShader=M,this}var dw=0,Gd=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,i){let r=this._getShaderCacheForMaterial(e);return r.has(t)===!1&&(r.add(t),t.usedTimes++),r.has(i)===!1&&(r.add(i),i.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let i of t)i.usedTimes--,i.usedTimes===0&&this.shaderCache.delete(i.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,i=t.get(e);return i===void 0&&(i=new Set,t.set(e,i)),i}_getShaderStage(e){let t=this.shaderCache,i=t.get(e);return i===void 0&&(i=new Wd(e),t.set(e,i)),i}},Wd=class{constructor(e){this.id=dw++,this.code=e,this.usedTimes=0}};function fw(n){return n===hr||n===ta||n===na}function pw(n,e,t,i,r,s){let o=new Bo,a=new Gd,l=new Set,c=[],h=new Map,u=i.logarithmicDepthBuffer,f={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function d(v){return l.add(v),v===0?"uv":`uv${v}`}function p(v,A,L,C,k,H){let j=C.fog,I=k.geometry,V=v.isMeshStandardMaterial||v.isMeshLambertMaterial||v.isMeshPhongMaterial?C.environment:null,G=v.isMeshStandardMaterial||v.isMeshLambertMaterial&&!v.envMap||v.isMeshPhongMaterial&&!v.envMap,W=e.get(v.envMap||V,G),te=f[v.type],X=i.precision;v.precision!==null&&(X=i.getMaxPrecision(v.precision),X!==v.precision&&Ie("WebGLProgram.getParameters:",v.precision,"not supported, using",X,"instead."));let ee=I.morphAttributes.position||I.morphAttributes.normal||I.morphAttributes.color,ne=ee!==void 0?ee.length:0,be=0;I.morphAttributes.position!==void 0&&(be=1),I.morphAttributes.normal!==void 0&&(be=2),I.morphAttributes.color!==void 0&&(be=3);let ke,J,me,Me;if(te){let ge=xi[te];ke=ge.vertexShader,J=ge.fragmentShader}else{ke=v.vertexShader,J=v.fragmentShader;let ge=a.getVertexShaderStage(v),ct=a.getFragmentShaderStage(v);a.update(v,ge,ct),me=ge.id,Me=ct.id}let Le=n.getRenderTarget(),xe=n.state.buffers.depth.getReversed(),He=k.isInstancedMesh===!0,At=k.isBatchedMesh===!0,Ne=!!v.map,lt=!!v.matcap,ut=!!W,Je=ut&&W.isPMREMTexture===!0,Zt=!!v.aoMap,Nt=!!v.lightMap,yn=!!v.bumpMap&&v.wireframe===!1,_t=!!v.normalMap,ai=!!v.displacementMap,Vt=!!v.emissiveMap,Fn=!!v.metalnessMap,Un=!!v.roughnessMap,Bn=v.anisotropy>0,F=v.clearcoat>0,zn=v.diffuseRoughness>0,yt=v.dispersion>0,bt=v.retroreflectivity>0,pe=v.iridescence>0,Ot=v.sheen>0,De=v.transmission>0,Be=Bn&&!!v.anisotropyMap,R=F&&!!v.clearcoatMap,S=F&&!!v.clearcoatNormalMap,B=F&&!!v.clearcoatRoughnessMap,ie=zn&&!!v.diffuseRoughnessMap,Q=pe&&!!v.iridescenceMap,ae=pe&&!!v.iridescenceThicknessMap,de=Ot&&!!v.sheenColorMap,Y=Ot&&!!v.sheenRoughnessMap,Z=!!v.specularMap,ce=!!v.specularColorMap,P=!!v.specularIntensityMap,K=De&&!!v.transmissionMap,q=De&&!!v.thicknessMap,he=!!v.gradientMap,oe=!!v.alphaMap,le=v.alphaTest>0,Ae=!!v.alphaHash,We=!!v.extensions,se=gi;v.toneMapped&&(Le===null||Le.isXRRenderTarget===!0)&&(se=n.toneMapping);let Ce=Je?W.isCompressedCubeTexture?W.image[0].mipmaps:W.mipmaps:null,Ve={shaderID:te,shaderType:v.type,shaderName:v.name,vertexShader:ke,fragmentShader:J,defines:v.defines,customVertexShaderID:me,customFragmentShaderID:Me,isRawShaderMaterial:v.isRawShaderMaterial===!0,glslVersion:v.glslVersion,precision:X,batching:At,batchingColor:At&&k._colorsTexture!==null,instancing:He,instancingColor:He&&k.instanceColor!==null,instancingMorph:He&&k.morphTexture!==null,outputColorSpace:Le===null?n.outputColorSpace:Le.isXRRenderTarget===!0?Le.texture.colorSpace:qe.workingColorSpace,alphaToCoverage:!!v.alphaToCoverage,map:Ne,matcap:lt,envMap:ut,envMapMode:ut&&W.mapping,envMapPMREM:Je,envMapMaxLod:Je?Ce.length-1:null,envMapSize:Je?Ce[0].width:null,aoMap:Zt,lightMap:Nt,bumpMap:yn,normalMap:_t,displacementMap:ai,emissiveMap:Vt,normalMapObjectSpace:_t&&v.normalMapType===tg,normalMapTangentSpace:_t&&v.normalMapType===_d,packedNormalMap:_t&&v.normalMapType===_d&&fw(v.normalMap.format),metalnessMap:Fn,roughnessMap:Un,anisotropy:Bn,anisotropyMap:Be,clearcoat:F,clearcoatMap:R,clearcoatNormalMap:S,clearcoatRoughnessMap:B,diffuseRoughness:zn,diffuseRoughnessMap:ie,dispersion:yt,retroreflection:bt,iridescence:pe,iridescenceMap:Q,iridescenceThicknessMap:ae,sheen:Ot,sheenColorMap:de,sheenRoughnessMap:Y,specularMap:Z,specularColorMap:ce,specularIntensityMap:P,transmission:De,transmissionMap:K,thicknessMap:q,gradientMap:he,opaque:v.transparent===!1&&v.blending===Us&&v.alphaToCoverage===!1,alphaMap:oe,alphaTest:le,alphaHash:Ae,combine:v.combine,mapUv:Ne&&d(v.map.channel),aoMapUv:Zt&&d(v.aoMap.channel),lightMapUv:Nt&&d(v.lightMap.channel),bumpMapUv:yn&&d(v.bumpMap.channel),normalMapUv:_t&&d(v.normalMap.channel),displacementMapUv:ai&&d(v.displacementMap.channel),emissiveMapUv:Vt&&d(v.emissiveMap.channel),metalnessMapUv:Fn&&d(v.metalnessMap.channel),roughnessMapUv:Un&&d(v.roughnessMap.channel),anisotropyMapUv:Be&&d(v.anisotropyMap.channel),clearcoatMapUv:R&&d(v.clearcoatMap.channel),clearcoatNormalMapUv:S&&d(v.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:B&&d(v.clearcoatRoughnessMap.channel),diffuseRoughnessMapUv:ie&&d(v.diffuseRoughnessMap.channel),iridescenceMapUv:Q&&d(v.iridescenceMap.channel),iridescenceThicknessMapUv:ae&&d(v.iridescenceThicknessMap.channel),sheenColorMapUv:de&&d(v.sheenColorMap.channel),sheenRoughnessMapUv:Y&&d(v.sheenRoughnessMap.channel),specularMapUv:Z&&d(v.specularMap.channel),specularColorMapUv:ce&&d(v.specularColorMap.channel),specularIntensityMapUv:P&&d(v.specularIntensityMap.channel),transmissionMapUv:K&&d(v.transmissionMap.channel),thicknessMapUv:q&&d(v.thicknessMap.channel),alphaMapUv:oe&&d(v.alphaMap.channel),vertexTangents:!!I.attributes.tangent&&(_t||Bn),vertexNormals:!!I.attributes.normal,vertexColors:v.vertexColors,vertexAlphas:v.vertexColors===!0&&!!I.attributes.color&&I.attributes.color.itemSize===4,pointsUvs:k.isPoints===!0&&!!I.attributes.uv&&(Ne||oe),fog:!!j,useFog:v.fog===!0,fogExp2:!!j&&j.isFogExp2,flatShading:v.wireframe===!1&&(v.flatShading===!0||I.attributes.normal===void 0&&_t===!1&&(v.isMeshLambertMaterial||v.isMeshPhongMaterial||v.isMeshStandardMaterial||v.isMeshPhysicalMaterial)),sizeAttenuation:v.sizeAttenuation===!0,logarithmicDepthBuffer:u,reversedDepthBuffer:xe,skinning:k.isSkinnedMesh===!0,hasPositionAttribute:I.attributes.position!==void 0,morphTargets:I.morphAttributes.position!==void 0,morphNormals:I.morphAttributes.normal!==void 0,morphColors:I.morphAttributes.color!==void 0,morphTargetsCount:ne,morphTextureStride:be,numSunLights:A.sun.length,numDirLights:A.directional.length,numPointLights:A.point.length,numSpotLights:A.spot.length,numSpotLightMaps:A.spotLightMap.length,numRectAreaLights:A.rectArea.length,numHemiLights:A.hemi.length,numSunLightShadows:A.sunShadowMap.length,numDirLightShadows:A.directionalShadowMap.length,numPointLightShadows:A.pointShadowMap.length,numSpotLightShadows:A.spotShadowMap.length,numSpotLightShadowsWithMaps:A.numSpotLightShadowsWithMaps,numLightProbes:A.numLightProbes,numLightProbeGrids:H.filter(ge=>ge.texture!==null).length,numClippingPlanes:s.numPlanes,numClipIntersection:s.numIntersection,dithering:v.dithering,shadowMapEnabled:n.shadowMap.enabled&&L.length>0,shadowMapType:n.shadowMap.type,toneMapping:se,decodeVideoTexture:Ne&&v.map.isVideoTexture===!0&&qe.getTransfer(v.map.colorSpace)===ot,decodeVideoTextureEmissive:Vt&&v.emissiveMap.isVideoTexture===!0&&qe.getTransfer(v.emissiveMap.colorSpace)===ot,premultipliedAlpha:v.premultipliedAlpha,doubleSided:v.side===Dn,flipSided:v.side===gn,useDepthPacking:v.depthPacking>=0,depthPacking:v.depthPacking||0,index0AttributeName:v.index0AttributeName,extensionClipCullDistance:We&&v.extensions.clipCullDistance===!0&&t.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(We&&v.extensions.multiDraw===!0||At)&&t.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:t.has("KHR_parallel_shader_compile"),customProgramCacheKey:v.customProgramCacheKey()};return Ve.vertexUv1s=l.has(1),Ve.vertexUv2s=l.has(2),Ve.vertexUv3s=l.has(3),l.clear(),Ve}function y(v){let A=[];if(v.shaderID?A.push(v.shaderID):(A.push(v.customVertexShaderID),A.push(v.customFragmentShaderID)),v.defines!==void 0)for(let L in v.defines)A.push(L),A.push(v.defines[L]);return v.isRawShaderMaterial===!1&&(m(A,v),g(A,v),A.push(n.outputColorSpace)),A.push(v.customProgramCacheKey),A.join()}function m(v,A){v.push(A.precision),v.push(A.outputColorSpace),v.push(A.envMapMode),v.push(A.envMapPMREM),v.push(A.envMapMaxLod),v.push(A.envMapSize),v.push(A.mapUv),v.push(A.alphaMapUv),v.push(A.lightMapUv),v.push(A.aoMapUv),v.push(A.bumpMapUv),v.push(A.normalMapUv),v.push(A.displacementMapUv),v.push(A.emissiveMapUv),v.push(A.metalnessMapUv),v.push(A.roughnessMapUv),v.push(A.anisotropyMapUv),v.push(A.clearcoatMapUv),v.push(A.clearcoatNormalMapUv),v.push(A.clearcoatRoughnessMapUv),v.push(A.diffuseRoughnessMapUv),v.push(A.iridescenceMapUv),v.push(A.iridescenceThicknessMapUv),v.push(A.sheenColorMapUv),v.push(A.sheenRoughnessMapUv),v.push(A.specularMapUv),v.push(A.specularColorMapUv),v.push(A.specularIntensityMapUv),v.push(A.transmissionMapUv),v.push(A.thicknessMapUv),v.push(A.combine),v.push(A.fogExp2),v.push(A.sizeAttenuation),v.push(A.morphTargetsCount),v.push(A.numSunLights),v.push(A.numDirLights),v.push(A.numPointLights),v.push(A.numSpotLights),v.push(A.numSpotLightMaps),v.push(A.numHemiLights),v.push(A.numRectAreaLights),v.push(A.numSunLightShadows),v.push(A.numDirLightShadows),v.push(A.numPointLightShadows),v.push(A.numSpotLightShadows),v.push(A.numSpotLightShadowsWithMaps),v.push(A.numLightProbes),v.push(A.numLightProbeGrids),v.push(A.shadowMapType),v.push(A.toneMapping),v.push(A.numClippingPlanes),v.push(A.numClipIntersection),v.push(A.depthPacking)}function g(v,A){o.disableAll(),A.instancing&&o.enable(0),A.instancingColor&&o.enable(1),A.instancingMorph&&o.enable(2),A.matcap&&o.enable(3),A.envMap&&o.enable(4),A.normalMapObjectSpace&&o.enable(5),A.normalMapTangentSpace&&o.enable(6),A.clearcoat&&o.enable(7),A.iridescence&&o.enable(8),A.alphaTest&&o.enable(9),A.vertexColors&&o.enable(10),A.vertexAlphas&&o.enable(11),A.vertexUv1s&&o.enable(12),A.vertexUv2s&&o.enable(13),A.vertexUv3s&&o.enable(14),A.vertexTangents&&o.enable(15),A.anisotropy&&o.enable(16),A.alphaHash&&o.enable(17),A.batching&&o.enable(18),A.dispersion&&o.enable(19),A.retroreflection&&o.enable(24),A.diffuseRoughness&&o.enable(25),A.batchingColor&&o.enable(20),A.gradientMap&&o.enable(21),A.packedNormalMap&&o.enable(22),A.vertexNormals&&o.enable(23),v.push(o.mask),o.disableAll(),A.fog&&o.enable(0),A.useFog&&o.enable(1),A.flatShading&&o.enable(2),A.logarithmicDepthBuffer&&o.enable(3),A.reversedDepthBuffer&&o.enable(4),A.skinning&&o.enable(5),A.morphTargets&&o.enable(6),A.morphNormals&&o.enable(7),A.morphColors&&o.enable(8),A.premultipliedAlpha&&o.enable(9),A.shadowMapEnabled&&o.enable(10),A.doubleSided&&o.enable(11),A.flipSided&&o.enable(12),A.useDepthPacking&&o.enable(13),A.dithering&&o.enable(14),A.transmission&&o.enable(15),A.sheen&&o.enable(16),A.opaque&&o.enable(17),A.pointsUvs&&o.enable(18),A.decodeVideoTexture&&o.enable(19),A.decodeVideoTextureEmissive&&o.enable(20),A.alphaToCoverage&&o.enable(21),A.numLightProbeGrids>0&&o.enable(22),A.hasPositionAttribute&&o.enable(23),v.push(o.mask)}function b(v){let A=f[v.type],L;if(A){let C=xi[A];L=fg.clone(C.uniforms)}else L=v.uniforms;return L}function _(v,A){let L=h.get(A);return L!==void 0?++L.usedTimes:(L=new uw(n,A,v,r),c.push(L),h.set(A,L)),L}function x(v){if(--v.usedTimes===0){let A=c.indexOf(v);c[A]=c[c.length-1],c.pop(),h.delete(v.cacheKey),v.destroy()}}function M(v){a.remove(v)}function E(){a.dispose()}return{getParameters:p,getProgramCacheKey:y,getUniforms:b,acquireProgram:_,releaseProgram:x,releaseShaderCache:M,programs:c,dispose:E}}function mw(){let n=new WeakMap;function e(o){return n.has(o)}function t(o){let a=n.get(o);return a===void 0&&(a={},n.set(o,a)),a}function i(o){n.delete(o)}function r(o,a,l){n.get(o)[a]=l}function s(){n=new WeakMap}return{has:e,get:t,remove:i,update:r,dispose:s}}function gw(n,e){return n.groupOrder!==e.groupOrder?n.groupOrder-e.groupOrder:n.renderOrder!==e.renderOrder?n.renderOrder-e.renderOrder:n.material.id!==e.material.id?n.material.id-e.material.id:n.materialVariant!==e.materialVariant?n.materialVariant-e.materialVariant:n.z!==e.z?n.z-e.z:n.id-e.id}function Dg(n,e){return n.groupOrder!==e.groupOrder?n.groupOrder-e.groupOrder:n.renderOrder!==e.renderOrder?n.renderOrder-e.renderOrder:n.z!==e.z?e.z-n.z:n.id-e.id}function kg(){let n=[],e=0,t=[],i=[],r=[];function s(){e=0,t.length=0,i.length=0,r.length=0}function o(f){let d=0;return f.isInstancedMesh&&(d+=2),f.isSkinnedMesh&&(d+=1),d}function a(f,d,p,y,m,g){let b=n[e];return b===void 0?(b={id:f.id,object:f,geometry:d,material:p,materialVariant:o(f),groupOrder:y,renderOrder:f.renderOrder,z:m,group:g},n[e]=b):(b.id=f.id,b.object=f,b.geometry=d,b.material=p,b.materialVariant=o(f),b.groupOrder=y,b.renderOrder=f.renderOrder,b.z=m,b.group=g),e++,b}function l(f,d,p,y,m,g,b){b.reversedDepth===!0&&(m=-m);let _=a(f,d,p,y,m,g);p.transmission>0?i.push(_):p.transparent===!0?r.push(_):t.push(_)}function c(f,d,p,y,m,g){let b=a(f,d,p,y,m,g);p.transmission>0?i.unshift(b):p.transparent===!0?r.unshift(b):t.unshift(b)}function h(f,d){t.length>1&&t.sort(f||gw),i.length>1&&i.sort(d||Dg),r.length>1&&r.sort(d||Dg)}function u(){for(let f=e,d=n.length;f<d;f++){let p=n[f];if(p.id===null)break;p.id=null,p.object=null,p.geometry=null,p.material=null,p.group=null}}return{opaque:t,transmissive:i,transparent:r,init:s,push:l,unshift:c,finish:u,sort:h}}function yw(){let n=new WeakMap;function e(i,r){let s=n.get(i),o;return s===void 0?(o=new kg,n.set(i,[o])):r>=s.length?(o=new kg,s.push(o)):o=s[r],o}function t(){n=new WeakMap}return{get:e,dispose:t}}function bw(){let n={};return{get:function(e){if(n[e.id]!==void 0)return n[e.id];let t;switch(e.type){case"SunLight":case"DirectionalLight":t={direction:new O,color:new je};break;case"SpotLight":t={position:new O,direction:new O,color:new je,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new O,color:new je,distance:0,decay:0};break;case"HemisphereLight":t={direction:new O,skyColor:new je,groundColor:new je};break;case"RectAreaLight":t={color:new je,position:new O,halfWidth:new O,halfHeight:new O};break}return n[e.id]=t,t}}}function xw(){let n={};return{get:function(e){if(n[e.id]!==void 0)return n[e.id];let t;switch(e.type){case"SunLight":case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Pe};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Pe};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Pe,shadowCameraNear:1,shadowCameraFar:1e3};break}return n[e.id]=t,t}}}var vw=0;function _w(n,e){return(e.castShadow?2:0)-(n.castShadow?2:0)+(e.map?1:0)-(n.map?1:0)}function Sw(n){let e=new bw,t=xw(),i={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)i.probe.push(new O);let r=new O,s=new ft,o=new ft;function a(c){let h=0,u=0,f=0;for(let H=0;H<9;H++)i.probe[H].set(0,0,0);let d=0,p=0,y=0,m=0,g=0,b=0,_=0,x=0,M=0,E=0,v=0,A=0,L=0,C=0;c.sort(_w);for(let H=0,j=c.length;H<j;H++){let I=c[H],V=I.color,G=I.intensity,W=I.distance,te=null;if(I.shadow&&I.shadow.map&&(I.shadow.map.texture.format===hr?te=I.shadow.map.texture:te=I.shadow.map.depthTexture||I.shadow.map.texture),I.isAmbientLight)h+=V.r*G,u+=V.g*G,f+=V.b*G;else if(I.isLightProbe){for(let X=0;X<9;X++)i.probe[X].addScaledVector(I.sh.coefficients[X],G);C++}else if(I.isSunLight){let X=e.get(I);if(X.color.copy(I.color).multiplyScalar(I.intensity),I.castShadow){let ee=I.shadow,ne=t.get(I);ne.shadowIntensity=ee.intensity,ne.shadowBias=ee.bias,ne.shadowNormalBias=ee.normalBias,ne.shadowRadius=ee.radius,ne.shadowMapSize.copy(ee.mapSize).multiply(ee.getFrameExtents()),i.sunShadow[p]=ne,i.sunShadowMap[p]=te;let be=ee.getViewportCount();for(let ke=0;ke<be;ke++)i.sunShadowMatrix[y+ke]=ee.getMatrix(ke),i.sunShadowCascade[y+ke]=ee._cascadeData[ke];y+=be,p++}i.sun[d]=X,d++}else if(I.isDirectionalLight){let X=e.get(I);if(X.color.copy(I.color).multiplyScalar(I.intensity),I.castShadow){let ee=I.shadow,ne=t.get(I);ne.shadowIntensity=ee.intensity,ne.shadowBias=ee.bias,ne.shadowNormalBias=ee.normalBias,ne.shadowRadius=ee.radius,ne.shadowMapSize=ee.mapSize,i.directionalShadow[m]=ne,i.directionalShadowMap[m]=te,i.directionalShadowMatrix[m]=I.shadow.matrix,M++}i.directional[m]=X,m++}else if(I.isSpotLight){let X=e.get(I);X.position.setFromMatrixPosition(I.matrixWorld),X.color.copy(V).multiplyScalar(G),X.distance=W,X.coneCos=Math.cos(I.angle),X.penumbraCos=Math.cos(I.angle*(1-I.penumbra)),X.decay=I.decay,i.spot[b]=X;let ee=I.shadow;if(I.map&&(i.spotLightMap[A]=I.map,A++,ee.updateMatrices(I),I.castShadow&&L++),i.spotLightMatrix[b]=ee.matrix,I.castShadow){let ne=t.get(I);ne.shadowIntensity=ee.intensity,ne.shadowBias=ee.bias,ne.shadowNormalBias=ee.normalBias,ne.shadowRadius=ee.radius,ne.shadowMapSize=ee.mapSize,i.spotShadow[b]=ne,i.spotShadowMap[b]=te,v++}b++}else if(I.isRectAreaLight){let X=e.get(I);X.color.copy(V).multiplyScalar(G),X.halfWidth.set(I.width*.5,0,0),X.halfHeight.set(0,I.height*.5,0),i.rectArea[_]=X,_++}else if(I.isPointLight){let X=e.get(I);if(X.color.copy(I.color).multiplyScalar(I.intensity),X.distance=I.distance,X.decay=I.decay,I.castShadow){let ee=I.shadow,ne=t.get(I);ne.shadowIntensity=ee.intensity,ne.shadowBias=ee.bias,ne.shadowNormalBias=ee.normalBias,ne.shadowRadius=ee.radius,ne.shadowMapSize=ee.mapSize,ne.shadowCameraNear=ee.camera.near,ne.shadowCameraFar=ee.camera.far,i.pointShadow[g]=ne,i.pointShadowMap[g]=te,i.pointShadowMatrix[g]=I.shadow.matrix,E++}i.point[g]=X,g++}else if(I.isHemisphereLight){let X=e.get(I);X.skyColor.copy(I.color).multiplyScalar(G),X.groundColor.copy(I.groundColor).multiplyScalar(G),i.hemi[x]=X,x++}}_>0&&(n.has("OES_texture_float_linear")===!0?(i.rectAreaLTC1=ye.LTC_FLOAT_1,i.rectAreaLTC2=ye.LTC_FLOAT_2):(i.rectAreaLTC1=ye.LTC_HALF_1,i.rectAreaLTC2=ye.LTC_HALF_2)),i.ambient[0]=h,i.ambient[1]=u,i.ambient[2]=f;let k=i.hash;(k.sunLength!==d||k.directionalLength!==m||k.pointLength!==g||k.spotLength!==b||k.rectAreaLength!==_||k.hemiLength!==x||k.numSunShadows!==p||k.numDirectionalShadows!==M||k.numPointShadows!==E||k.numSpotShadows!==v||k.numSpotMaps!==A||k.numLightProbes!==C)&&(i.sun.length=d,i.directional.length=m,i.spot.length=b,i.rectArea.length=_,i.point.length=g,i.hemi.length=x,i.sunShadow.length=p,i.sunShadowMap.length=p,i.sunShadowMatrix.length=y,i.sunShadowCascade.length=y,i.directionalShadow.length=M,i.directionalShadowMap.length=M,i.directionalShadowMatrix.length=M,i.pointShadow.length=E,i.pointShadowMap.length=E,i.pointShadowMatrix.length=E,i.spotShadow.length=v,i.spotShadowMap.length=v,i.spotLightMatrix.length=v+A-L,i.spotLightMap.length=A,i.numSpotLightShadowsWithMaps=L,i.numLightProbes=C,k.sunLength=d,k.directionalLength=m,k.pointLength=g,k.spotLength=b,k.rectAreaLength=_,k.hemiLength=x,k.numSunShadows=p,k.numDirectionalShadows=M,k.numPointShadows=E,k.numSpotShadows=v,k.numSpotMaps=A,k.numLightProbes=C,i.version=vw++)}function l(c,h){let u=0,f=0,d=0,p=0,y=0,m=0,g=h.matrixWorldInverse;for(let b=0,_=c.length;b<_;b++){let x=c[b];if(x.isSunLight){let M=i.sun[u];M.direction.setFromMatrixPosition(x.matrixWorld),M.direction.transformDirection(g),u++}else if(x.isDirectionalLight){let M=i.directional[f];M.direction.setFromMatrixPosition(x.matrixWorld),r.setFromMatrixPosition(x.target.matrixWorld),M.direction.sub(r),M.direction.transformDirection(g),f++}else if(x.isSpotLight){let M=i.spot[p];M.position.setFromMatrixPosition(x.matrixWorld),M.position.applyMatrix4(g),M.direction.setFromMatrixPosition(x.matrixWorld),r.setFromMatrixPosition(x.target.matrixWorld),M.direction.sub(r),M.direction.transformDirection(g),p++}else if(x.isRectAreaLight){let M=i.rectArea[y];M.position.setFromMatrixPosition(x.matrixWorld),M.position.applyMatrix4(g),o.identity(),s.copy(x.matrixWorld),s.premultiply(g),o.extractRotation(s),M.halfWidth.set(x.width*.5,0,0),M.halfHeight.set(0,x.height*.5,0),M.halfWidth.applyMatrix4(o),M.halfHeight.applyMatrix4(o),y++}else if(x.isPointLight){let M=i.point[d];M.position.setFromMatrixPosition(x.matrixWorld),M.position.applyMatrix4(g),d++}else if(x.isHemisphereLight){let M=i.hemi[m];M.direction.setFromMatrixPosition(x.matrixWorld),M.direction.transformDirection(g),m++}}}return{setup:a,setupView:l,state:i}}function Ng(n){let e=new Sw(n),t=[],i=[],r=[];function s(u){h.camera=u,t.length=0,i.length=0,r.length=0}function o(u){u.isLightProbeGrid?r.push(u):t.push(u)}function a(u){i.push(u)}function l(){e.setup(t),r.sort((u,f)=>u.priority-f.priority||u.id-f.id)}function c(u){e.setupView(t,u)}let h={lightsArray:t,shadowsArray:i,lightProbeGridArray:r,camera:null,lights:e,transmissionRenderTarget:{},textureUnits:0};return{init:s,state:h,setupLights:l,setupLightsView:c,pushLight:o,pushShadow:a}}function Mw(n){let e=new WeakMap;function t(r,s=0){let o=e.get(r),a;return o===void 0?(a=new Ng(n),e.set(r,[a])):s>=o.length?(a=new Ng(n),o.push(a)):a=o[s],a}function i(){e=new WeakMap}return{get:t,dispose:i}}var ww=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,Ew=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,Tw=[new O(1,0,0),new O(-1,0,0),new O(0,1,0),new O(0,-1,0),new O(0,0,1),new O(0,0,-1)],Aw=[new O(0,-1,0),new O(0,-1,0),new O(0,0,1),new O(0,0,-1),new O(0,-1,0),new O(0,-1,0)],Og=new ft,ra=new O,Ud=new O;function Rw(n,e,t){let i=new Ur,r=new Pe,s=new Pe,o=new at,a=new nc,l=new ic,c={},h=t.maxTextureSize,u={[cr]:gn,[gn]:cr,[Dn]:Dn},f=new Pn({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Pe},radius:{value:4}},vertexShader:ww,fragmentShader:Ew}),d=f.clone();d.defines.HORIZONTAL_PASS=1;let p=new vt;p.setAttribute("position",new kt(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let y=new Jt(p,f),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Yo;let g=this.type;this.render=function(E,v,A){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||E.length===0)return;this.type===Lm&&(Ie("WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead."),this.type=Yo);let L=n.getRenderTarget(),C=n.getActiveCubeFace(),k=n.getActiveMipmapLevel(),H=n.state;H.setBlending(Ni),H.buffers.depth.getReversed()===!0?H.buffers.color.setClear(0,0,0,0):H.buffers.color.setClear(1,1,1,1),H.buffers.depth.setTest(!0),H.setScissorTest(!1);let j=g!==this.type;j&&v.traverse(function(I){I.material&&(Array.isArray(I.material)?I.material.forEach(V=>V.needsUpdate=!0):I.material.needsUpdate=!0)});for(let I=0,V=E.length;I<V;I++){let G=E[I],W=G.shadow;if(W===void 0){Ie("WebGLShadowMap:",G,"has no shadow.");continue}if(W.autoUpdate===!1&&W.needsUpdate===!1)continue;r.copy(W.mapSize);let te=W.getFrameExtents();r.multiply(te),s.copy(W.mapSize),(r.x>h||r.y>h)&&(r.x>h&&(s.x=Math.floor(h/te.x),r.x=s.x*te.x,W.mapSize.x=s.x),r.y>h&&(s.y=Math.floor(h/te.y),r.y=s.y*te.y,W.mapSize.y=s.y));let X=n.state.buffers.depth.getReversed();if(W.camera._reversedDepth=X,W.map===null||j===!0){if(W.map!==null&&(W.map.depthTexture!==null&&(W.map.depthTexture.dispose(),W.map.depthTexture=null),W.map.dispose()),this.type===Fs){if(G.isPointLight){Ie("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}W.map=new mn(r.x,r.y,{format:hr,type:ii,minFilter:pn,magFilter:pn,generateMipmaps:!1}),W.map.texture.name=G.name+".shadowMap",W.map.depthTexture=new ki(r.x,r.y,Nn),W.map.depthTexture.name=G.name+".shadowMapDepth",W.map.depthTexture.format=Li,W.map.depthTexture.compareFunction=null,W.map.depthTexture.minFilter=xt,W.map.depthTexture.magFilter=xt}else G.isPointLight?(W.map=new oa(r.x),W.map.depthTexture=new Go(r.x,ni)):(W.map=new mn(r.x,r.y),W.map.depthTexture=new ki(r.x,r.y,ni)),W.map.depthTexture.name=G.name+".shadowMap",W.map.depthTexture.format=Li,this.type===Yo?(W.map.depthTexture.compareFunction=X?Ed:wd,W.map.depthTexture.minFilter=pn,W.map.depthTexture.magFilter=pn):(W.map.depthTexture.compareFunction=null,W.map.depthTexture.minFilter=xt,W.map.depthTexture.magFilter=xt);W.camera.updateProjectionMatrix()}W.map.isWebGLCubeRenderTarget!==!0&&(W.map.width!==r.x||W.map.height!==r.y)&&W.map.setSize(r.x,r.y);let ee=W.map.isWebGLCubeRenderTarget?6:W.getViewportCount();G.isPointLight!==!0&&W.updateMatrices(G,A);let ne=(W.camera.layers.mask&4294967294)!==0?W.camera.layers:A.layers;for(let be=0;be<ee;be++){let ke=W.getCamera(be);if(G.isPointLight){let J=W.camera,me=W.matrix,Me=G.distance||J.far;Me!==J.far&&(J.far=Me,J.updateProjectionMatrix()),ra.setFromMatrixPosition(G.matrixWorld),J.position.copy(ra),Ud.copy(J.position),Ud.add(Tw[be]),J.up.copy(Aw[be]),J.lookAt(Ud),J.updateMatrixWorld(),me.makeTranslation(-ra.x,-ra.y,-ra.z),Og.multiplyMatrices(J.projectionMatrix,J.matrixWorldInverse),W._frustum.setFromProjectionMatrix(Og,J.coordinateSystem,J.reversedDepth)}if(W.map.isWebGLCubeRenderTarget)n.setRenderTarget(W.map,be),n.clear();else{be===0&&(n.setRenderTarget(W.map),n.clear());let J=W.getViewport(be);o.set(s.x*J.x,s.y*J.y,s.x*J.z,s.y*J.w),H.viewport(o)}i=W.getFrustum(be),x(v,A,ke,G,ne,this.type)}W.isPointLightShadow!==!0&&this.type===Fs&&b(W,A),W.needsUpdate=!1}g=this.type,m.needsUpdate=!1,n.setRenderTarget(L,C,k)};function b(E,v){let A=e.update(y);f.defines.VSM_SAMPLES!==E.blurSamples&&(f.defines.VSM_SAMPLES=E.blurSamples,d.defines.VSM_SAMPLES=E.blurSamples,f.needsUpdate=!0,d.needsUpdate=!0),E.mapPass===null?E.mapPass=new mn(r.x,r.y,{format:hr,type:ii}):(E.mapPass.width!==E.map.width||E.mapPass.height!==E.map.height)&&E.mapPass.setSize(E.map.width,E.map.height),f.uniforms.shadow_pass.value=E.map.depthTexture,f.uniforms.resolution.value.set(E.map.width,E.map.height),f.uniforms.radius.value=E.radius,n.setRenderTarget(E.mapPass),n.clear(),n.renderBufferDirect(v,null,A,f,y,null),d.uniforms.shadow_pass.value=E.mapPass.texture,d.uniforms.resolution.value.set(E.map.width,E.map.height),d.uniforms.radius.value=E.radius,n.setRenderTarget(E.map),n.clear(),n.renderBufferDirect(v,null,A,d,y,null)}function _(E,v,A,L){let C=null,k=A.isPointLight===!0?E.customDistanceMaterial:E.customDepthMaterial;if(k!==void 0)C=k;else if(C=A.isPointLight===!0?l:a,n.localClippingEnabled&&v.clipShadows===!0&&Array.isArray(v.clippingPlanes)&&v.clippingPlanes.length!==0||v.displacementMap&&v.displacementScale!==0||v.alphaMap&&v.alphaTest>0||v.map&&v.alphaTest>0||v.alphaToCoverage===!0){let H=C.uuid,j=v.uuid,I=c[H];I===void 0&&(I={},c[H]=I);let V=I[j];V===void 0&&(V=C.clone(),I[j]=V,v.addEventListener("dispose",M)),C=V}if(C.visible=v.visible,C.wireframe=v.wireframe,L===Fs?C.side=v.shadowSide!==null?v.shadowSide:v.side:C.side=v.shadowSide!==null?v.shadowSide:u[v.side],C.alphaMap=v.alphaMap,C.alphaTest=v.alphaToCoverage===!0?.5:v.alphaTest,C.map=v.map,C.clipShadows=v.clipShadows,C.clippingPlanes=v.clippingPlanes,C.clipIntersection=v.clipIntersection,C.displacementMap=v.displacementMap,C.displacementScale=v.displacementScale,C.displacementBias=v.displacementBias,C.wireframeLinewidth=v.wireframeLinewidth,C.linewidth=v.linewidth,A.isPointLight===!0&&C.isMeshDistanceMaterial===!0){let H=n.properties.get(C);H.light=A}return C}function x(E,v,A,L,C,k){if(E.visible===!1)return;if(E.layers.test(C)&&(E.isMesh||E.isLine||E.isPoints)&&(E.castShadow||E.receiveShadow&&k===Fs)&&(!E.frustumCulled||E.intersectsFrustum(i))){E.modelViewMatrix.multiplyMatrices(A.matrixWorldInverse,E.matrixWorld);let I=e.update(E),V=E.material;if(Array.isArray(V)){let G=I.groups;for(let W=0,te=G.length;W<te;W++){let X=G[W],ee=V[X.materialIndex];if(ee&&ee.visible){let ne=_(E,ee,L,k);E.onBeforeShadow(n,E,v,A,I,ne,X),n.renderBufferDirect(A,null,I,ne,E,X),E.onAfterShadow(n,E,v,A,I,ne,X)}}}else if(V.visible){let G=_(E,V,L,k);E.onBeforeShadow(n,E,v,A,I,G,null),n.renderBufferDirect(A,null,I,G,E,null),E.onAfterShadow(n,E,v,A,I,G,null)}}let j=E.children;for(let I=0,V=j.length;I<V;I++)x(j[I],v,A,L,C,k)}function M(E){E.target.removeEventListener("dispose",M);for(let A in c){let L=c[A],C=E.target.uuid;C in L&&(L[C].dispose(),delete L[C])}}}function Cw(n,e){function t(){let P=!1,K=new at,q=null,he=new at(0,0,0,0);return{setMask:function(oe){q!==oe&&!P&&(n.colorMask(oe,oe,oe,oe),q=oe)},setLocked:function(oe){P=oe},setClear:function(oe,le,Ae,We,se){se===!0&&(oe*=We,le*=We,Ae*=We),K.set(oe,le,Ae,We),he.equals(K)===!1&&(n.clearColor(oe,le,Ae,We),he.copy(K))},reset:function(){P=!1,q=null,he.set(-1,0,0,0)}}}function i(){let P=!1,K=!1,q=null,he=null,oe=null;return{setReversed:function(le){if(K!==le){let Ae=e.get("EXT_clip_control");le?Ae.clipControlEXT(Ae.LOWER_LEFT_EXT,Ae.ZERO_TO_ONE_EXT):Ae.clipControlEXT(Ae.LOWER_LEFT_EXT,Ae.NEGATIVE_ONE_TO_ONE_EXT),K=le;let We=oe;oe=null,this.setClear(We)}},getReversed:function(){return K},setTest:function(le){le?xe(n.DEPTH_TEST):He(n.DEPTH_TEST)},setMask:function(le){q!==le&&!P&&(n.depthMask(le),q=le)},setFunc:function(le){if(K&&(le=ug[le]),he!==le){switch(le){case Ul:n.depthFunc(n.NEVER);break;case Bl:n.depthFunc(n.ALWAYS);break;case zl:n.depthFunc(n.LESS);break;case Ss:n.depthFunc(n.LEQUAL);break;case Hl:n.depthFunc(n.EQUAL);break;case Vl:n.depthFunc(n.GEQUAL);break;case Gl:n.depthFunc(n.GREATER);break;case Wl:n.depthFunc(n.NOTEQUAL);break;default:n.depthFunc(n.LEQUAL)}he=le}},setLocked:function(le){P=le},setClear:function(le){oe!==le&&(oe=le,K&&(le=1-le),n.clearDepth(le))},reset:function(){P=!1,q=null,he=null,oe=null,K=!1}}}function r(){let P=!1,K=null,q=null,he=null,oe=null,le=null,Ae=null,We=null,se=null;return{setTest:function(Ce){P||(Ce?xe(n.STENCIL_TEST):He(n.STENCIL_TEST))},setMask:function(Ce){K!==Ce&&!P&&(n.stencilMask(Ce),K=Ce)},setFunc:function(Ce,Ve,ge){(q!==Ce||he!==Ve||oe!==ge)&&(n.stencilFunc(Ce,Ve,ge),q=Ce,he=Ve,oe=ge)},setOp:function(Ce,Ve,ge){(le!==Ce||Ae!==Ve||We!==ge)&&(n.stencilOp(Ce,Ve,ge),le=Ce,Ae=Ve,We=ge)},setLocked:function(Ce){P=Ce},setClear:function(Ce){se!==Ce&&(n.clearStencil(Ce),se=Ce)},reset:function(){P=!1,K=null,q=null,he=null,oe=null,le=null,Ae=null,We=null,se=null}}}let s=new t,o=new i,a=new r,l={},c=new WeakMap,h={},u={},f={},d=new WeakMap,p=[],y=null,m=!1,g=null,b=null,_=null,x=null,M=null,E=null,v=null,A=new je(0,0,0),L=0,C=!1,k=null,H=null,j=null,I=null,V=null,G=n.getParameter(n.MAX_COMBINED_TEXTURE_IMAGE_UNITS),W=!1,te=0,X=n.getParameter(n.VERSION);X.indexOf("WebGL")!==-1?(te=parseFloat(/^WebGL (\d)/.exec(X)[1]),W=te>=1):X.indexOf("OpenGL ES")!==-1&&(te=parseFloat(/^OpenGL ES (\d)/.exec(X)[1]),W=te>=2);let ee=null,ne={},be=n.getParameter(n.SCISSOR_BOX),ke=n.getParameter(n.VIEWPORT),J=new at().fromArray(be),me=new at().fromArray(ke);function Me(P,K,q,he){let oe=new Uint8Array(4),le=n.createTexture();n.bindTexture(P,le),n.texParameteri(P,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(P,n.TEXTURE_MAG_FILTER,n.NEAREST);for(let Ae=0;Ae<q;Ae++)P===n.TEXTURE_3D||P===n.TEXTURE_2D_ARRAY?n.texImage3D(K,0,n.RGBA,1,1,he,0,n.RGBA,n.UNSIGNED_BYTE,oe):n.texImage2D(K+Ae,0,n.RGBA,1,1,0,n.RGBA,n.UNSIGNED_BYTE,oe);return le}let Le={};Le[n.TEXTURE_2D]=Me(n.TEXTURE_2D,n.TEXTURE_2D,1),Le[n.TEXTURE_CUBE_MAP]=Me(n.TEXTURE_CUBE_MAP,n.TEXTURE_CUBE_MAP_POSITIVE_X,6),Le[n.TEXTURE_2D_ARRAY]=Me(n.TEXTURE_2D_ARRAY,n.TEXTURE_2D_ARRAY,1,1),Le[n.TEXTURE_3D]=Me(n.TEXTURE_3D,n.TEXTURE_3D,1,1),s.setClear(0,0,0,1),o.setClear(1),a.setClear(0),xe(n.DEPTH_TEST),o.setFunc(Ss),yn(!1),_t(Qu),xe(n.CULL_FACE),Zt(Ni);function xe(P){h[P]!==!0&&(n.enable(P),h[P]=!0)}function He(P){h[P]!==!1&&(n.disable(P),h[P]=!1)}function At(P,K){return f[P]!==K?(n.bindFramebuffer(P,K),f[P]=K,P===n.DRAW_FRAMEBUFFER&&(f[n.FRAMEBUFFER]=K),P===n.FRAMEBUFFER&&(f[n.DRAW_FRAMEBUFFER]=K),!0):!1}function Ne(P,K){let q=p,he=!1;if(P){q=d.get(K),q===void 0&&(q=[],d.set(K,q));let oe=P.textures;if(q.length!==oe.length||q[0]!==n.COLOR_ATTACHMENT0){for(let le=0,Ae=oe.length;le<Ae;le++)q[le]=n.COLOR_ATTACHMENT0+le;q.length=oe.length,he=!0}}else q[0]!==n.BACK&&(q[0]=n.BACK,he=!0);he&&n.drawBuffers(q)}function lt(P){return y!==P?(n.useProgram(P),y=P,!0):!1}let ut={[Vr]:n.FUNC_ADD,[km]:n.FUNC_SUBTRACT,[Nm]:n.FUNC_REVERSE_SUBTRACT};ut[Om]=n.MIN,ut[Fm]=n.MAX;let Je={[Um]:n.ZERO,[Bm]:n.ONE,[zm]:n.SRC_COLOR,[id]:n.SRC_ALPHA,[jm]:n.SRC_ALPHA_SATURATE,[Wm]:n.DST_COLOR,[Vm]:n.DST_ALPHA,[Hm]:n.ONE_MINUS_SRC_COLOR,[rd]:n.ONE_MINUS_SRC_ALPHA,[$m]:n.ONE_MINUS_DST_COLOR,[Gm]:n.ONE_MINUS_DST_ALPHA,[Xm]:n.CONSTANT_COLOR,[qm]:n.ONE_MINUS_CONSTANT_COLOR,[Ym]:n.CONSTANT_ALPHA,[Jm]:n.ONE_MINUS_CONSTANT_ALPHA};function Zt(P,K,q,he,oe,le,Ae,We,se,Ce){if(P===Ni){m===!0&&(He(n.BLEND),m=!1);return}if(m===!1&&(xe(n.BLEND),m=!0),P!==Dm){if(P!==g||Ce!==C){if((b!==Vr||M!==Vr)&&(n.blendEquation(n.FUNC_ADD),b=Vr,M=Vr),Ce)switch(P){case Us:n.blendFuncSeparate(n.ONE,n.ONE_MINUS_SRC_ALPHA,n.ONE,n.ONE_MINUS_SRC_ALPHA);break;case ed:n.blendFunc(n.ONE,n.ONE);break;case td:n.blendFuncSeparate(n.ZERO,n.ONE_MINUS_SRC_COLOR,n.ZERO,n.ONE);break;case nd:n.blendFuncSeparate(n.DST_COLOR,n.ONE_MINUS_SRC_ALPHA,n.ZERO,n.ONE);break;default:Fe("WebGLState: Invalid blending: ",P);break}else switch(P){case Us:n.blendFuncSeparate(n.SRC_ALPHA,n.ONE_MINUS_SRC_ALPHA,n.ONE,n.ONE_MINUS_SRC_ALPHA);break;case ed:n.blendFuncSeparate(n.SRC_ALPHA,n.ONE,n.ONE,n.ONE);break;case td:Fe("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case nd:Fe("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:Fe("WebGLState: Invalid blending: ",P);break}_=null,x=null,E=null,v=null,A.set(0,0,0),L=0,g=P,C=Ce}return}oe=oe||K,le=le||q,Ae=Ae||he,(K!==b||oe!==M)&&(n.blendEquationSeparate(ut[K],ut[oe]),b=K,M=oe),(q!==_||he!==x||le!==E||Ae!==v)&&(n.blendFuncSeparate(Je[q],Je[he],Je[le],Je[Ae]),_=q,x=he,E=le,v=Ae),(We.equals(A)===!1||se!==L)&&(n.blendColor(We.r,We.g,We.b,se),A.copy(We),L=se),g=P,C=!1}function Nt(P,K){P.side===Dn?He(n.CULL_FACE):xe(n.CULL_FACE);let q=P.side===gn;K&&(q=!q),yn(q),P.blending===Us&&P.transparent===!1?Zt(Ni):Zt(P.blending,P.blendEquation,P.blendSrc,P.blendDst,P.blendEquationAlpha,P.blendSrcAlpha,P.blendDstAlpha,P.blendColor,P.blendAlpha,P.premultipliedAlpha),o.setFunc(P.depthFunc),o.setTest(P.depthTest),o.setMask(P.depthWrite),s.setMask(P.colorWrite);let he=P.stencilWrite;a.setTest(he),he&&(a.setMask(P.stencilWriteMask),a.setFunc(P.stencilFunc,P.stencilRef,P.stencilFuncMask),a.setOp(P.stencilFail,P.stencilZFail,P.stencilZPass)),Vt(P.polygonOffset,P.polygonOffsetFactor,P.polygonOffsetUnits),P.alphaToCoverage===!0?xe(n.SAMPLE_ALPHA_TO_COVERAGE):He(n.SAMPLE_ALPHA_TO_COVERAGE)}function yn(P){k!==P&&(P?n.frontFace(n.CW):n.frontFace(n.CCW),k=P)}function _t(P){P!==Pm?(xe(n.CULL_FACE),P!==H&&(P===Qu?n.cullFace(n.BACK):P===Im?n.cullFace(n.FRONT):n.cullFace(n.FRONT_AND_BACK))):He(n.CULL_FACE),H=P}function ai(P){P!==j&&(W&&n.lineWidth(P),j=P)}function Vt(P,K,q){P?(xe(n.POLYGON_OFFSET_FILL),(I!==K||V!==q)&&(I=K,V=q,o.getReversed()&&(K=-K,q=-q),n.polygonOffset(K,q))):He(n.POLYGON_OFFSET_FILL)}function Fn(P){P?xe(n.SCISSOR_TEST):He(n.SCISSOR_TEST)}function Un(P){P===void 0&&(P=n.TEXTURE0+G-1),ee!==P&&(n.activeTexture(P),ee=P)}function Bn(P,K,q){q===void 0&&(ee===null?q=n.TEXTURE0+G-1:q=ee);let he=ne[q];he===void 0&&(he={type:void 0,texture:void 0},ne[q]=he),(he.type!==P||he.texture!==K)&&(ee!==q&&(n.activeTexture(q),ee=q),n.bindTexture(P,K||Le[P]),he.type=P,he.texture=K)}function F(){let P=ne[ee];P!==void 0&&P.type!==void 0&&(n.bindTexture(P.type,null),P.type=void 0,P.texture=void 0)}function zn(){try{n.compressedTexImage2D(...arguments)}catch(P){Fe("WebGLState:",P)}}function yt(){try{n.compressedTexImage3D(...arguments)}catch(P){Fe("WebGLState:",P)}}function bt(){try{n.texSubImage2D(...arguments)}catch(P){Fe("WebGLState:",P)}}function pe(){try{n.texSubImage3D(...arguments)}catch(P){Fe("WebGLState:",P)}}function Ot(){try{n.compressedTexSubImage2D(...arguments)}catch(P){Fe("WebGLState:",P)}}function De(){try{n.compressedTexSubImage3D(...arguments)}catch(P){Fe("WebGLState:",P)}}function Be(){try{n.texStorage2D(...arguments)}catch(P){Fe("WebGLState:",P)}}function R(){try{n.texStorage3D(...arguments)}catch(P){Fe("WebGLState:",P)}}function S(){try{n.texImage2D(...arguments)}catch(P){Fe("WebGLState:",P)}}function B(){try{n.texImage3D(...arguments)}catch(P){Fe("WebGLState:",P)}}function ie(P){return u[P]!==void 0?u[P]:n.getParameter(P)}function Q(P,K){u[P]!==K&&(n.pixelStorei(P,K),u[P]=K)}function ae(P){J.equals(P)===!1&&(n.scissor(P.x,P.y,P.z,P.w),J.copy(P))}function de(P){me.equals(P)===!1&&(n.viewport(P.x,P.y,P.z,P.w),me.copy(P))}function Y(P,K){let q=c.get(K);q===void 0&&(q=new WeakMap,c.set(K,q));let he=q.get(P);he===void 0&&(he=n.getUniformBlockIndex(K,P.name),n.uniformBlockBinding(K,he,he),q.set(P,he))}function Z(P,K,q){let oe=c.get(K).get(P);l[oe]!==q&&(n.bindBufferBase(n.UNIFORM_BUFFER,oe,q),l[oe]=q)}function ce(){n.disable(n.BLEND),n.disable(n.CULL_FACE),n.disable(n.DEPTH_TEST),n.disable(n.POLYGON_OFFSET_FILL),n.disable(n.SCISSOR_TEST),n.disable(n.STENCIL_TEST),n.disable(n.SAMPLE_ALPHA_TO_COVERAGE),n.blendEquation(n.FUNC_ADD),n.blendFunc(n.ONE,n.ZERO),n.blendFuncSeparate(n.ONE,n.ZERO,n.ONE,n.ZERO),n.blendColor(0,0,0,0),n.colorMask(!0,!0,!0,!0),n.clearColor(0,0,0,0),n.depthMask(!0),n.depthFunc(n.LESS),o.setReversed(!1),n.clearDepth(1),n.stencilMask(4294967295),n.stencilFunc(n.ALWAYS,0,4294967295),n.stencilOp(n.KEEP,n.KEEP,n.KEEP),n.clearStencil(0),n.cullFace(n.BACK),n.frontFace(n.CCW),n.polygonOffset(0,0),n.activeTexture(n.TEXTURE0),n.bindFramebuffer(n.FRAMEBUFFER,null),n.bindFramebuffer(n.DRAW_FRAMEBUFFER,null),n.bindFramebuffer(n.READ_FRAMEBUFFER,null),n.useProgram(null),n.lineWidth(1),n.scissor(0,0,n.canvas.width,n.canvas.height),n.viewport(0,0,n.canvas.width,n.canvas.height),n.pixelStorei(n.PACK_ALIGNMENT,4),n.pixelStorei(n.UNPACK_ALIGNMENT,4),n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,!1),n.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),n.pixelStorei(n.UNPACK_COLORSPACE_CONVERSION_WEBGL,n.BROWSER_DEFAULT_WEBGL),n.pixelStorei(n.PACK_ROW_LENGTH,0),n.pixelStorei(n.PACK_SKIP_PIXELS,0),n.pixelStorei(n.PACK_SKIP_ROWS,0),n.pixelStorei(n.UNPACK_ROW_LENGTH,0),n.pixelStorei(n.UNPACK_IMAGE_HEIGHT,0),n.pixelStorei(n.UNPACK_SKIP_PIXELS,0),n.pixelStorei(n.UNPACK_SKIP_ROWS,0),n.pixelStorei(n.UNPACK_SKIP_IMAGES,0),h={},u={},ee=null,ne={},f={},l={},d=new WeakMap,p=[],y=null,m=!1,g=null,b=null,_=null,x=null,M=null,E=null,v=null,A=new je(0,0,0),L=0,C=!1,k=null,H=null,j=null,I=null,V=null,J.set(0,0,n.canvas.width,n.canvas.height),me.set(0,0,n.canvas.width,n.canvas.height),s.reset(),o.reset(),a.reset()}return{buffers:{color:s,depth:o,stencil:a},enable:xe,disable:He,bindFramebuffer:At,drawBuffers:Ne,useProgram:lt,setBlending:Zt,setMaterial:Nt,setFlipSided:yn,setCullFace:_t,setLineWidth:ai,setPolygonOffset:Vt,setScissorTest:Fn,activeTexture:Un,bindTexture:Bn,unbindTexture:F,compressedTexImage2D:zn,compressedTexImage3D:yt,texImage2D:S,texImage3D:B,pixelStorei:Q,getParameter:ie,updateUBOMapping:Y,uniformBlockBinding:Z,texStorage2D:Be,texStorage3D:R,texSubImage2D:bt,texSubImage3D:pe,compressedTexSubImage2D:Ot,compressedTexSubImage3D:De,scissor:ae,viewport:de,reset:ce}}function Pw(n,e,t,i,r,s,o){let a=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new Pe,h=new WeakMap,u=new Set,f,d=new WeakMap,p=new Set,y=new FinalizationRegistry(R=>p.delete(R)),m=!1;try{m=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(R,S){return m?new OffscreenCanvas(R,S):Oo("canvas")}function b(R,S,B){let ie=1,Q=Be(R);if((Q.width>B||Q.height>B)&&(ie=B/Math.max(Q.width,Q.height)),ie<1)if(typeof HTMLImageElement<"u"&&R instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&R instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&R instanceof ImageBitmap||typeof VideoFrame<"u"&&R instanceof VideoFrame){let ae=Math.floor(ie*Q.width),de=Math.floor(ie*Q.height);f===void 0&&(f=g(ae,de));let Y=S?g(ae,de):f;return Y.width=ae,Y.height=de,Y.getContext("2d").drawImage(R,0,0,ae,de),Ie("WebGLRenderer: Texture has been resized from ("+Q.width+"x"+Q.height+") to ("+ae+"x"+de+")."),Y}else return"data"in R&&Ie("WebGLRenderer: Image in DataTexture is too big ("+Q.width+"x"+Q.height+")."),R;return R}function _(R){return R.generateMipmaps}function x(R){n.generateMipmap(R)}function M(R){return R.isWebGLCubeRenderTarget?n.TEXTURE_CUBE_MAP:R.isWebGL3DRenderTarget?n.TEXTURE_3D:R.isWebGLArrayRenderTarget||R.isCompressedArrayTexture?n.TEXTURE_2D_ARRAY:n.TEXTURE_2D}function E(R,S,B,ie,Q,ae=!1){if(R!==null){if(n[R]!==void 0)return n[R];Ie("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+R+"'")}let de;ie&&(de=e.get("EXT_texture_norm16"),de||Ie("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let Y=S;if(S===n.RED&&(B===n.FLOAT&&(Y=n.R32F),B===n.HALF_FLOAT&&(Y=n.R16F),B===n.UNSIGNED_BYTE&&(Y=n.R8),B===n.UNSIGNED_SHORT&&de&&(Y=de.R16_EXT),B===n.SHORT&&de&&(Y=de.R16_SNORM_EXT)),S===n.RED_INTEGER&&(B===n.UNSIGNED_BYTE&&(Y=n.R8UI),B===n.UNSIGNED_SHORT&&(Y=n.R16UI),B===n.UNSIGNED_INT&&(Y=n.R32UI),B===n.BYTE&&(Y=n.R8I),B===n.SHORT&&(Y=n.R16I),B===n.INT&&(Y=n.R32I)),S===n.RG&&(B===n.FLOAT&&(Y=n.RG32F),B===n.HALF_FLOAT&&(Y=n.RG16F),B===n.UNSIGNED_BYTE&&(Y=n.RG8),B===n.UNSIGNED_SHORT&&de&&(Y=de.RG16_EXT),B===n.SHORT&&de&&(Y=de.RG16_SNORM_EXT)),S===n.RG_INTEGER&&(B===n.UNSIGNED_BYTE&&(Y=n.RG8UI),B===n.UNSIGNED_SHORT&&(Y=n.RG16UI),B===n.UNSIGNED_INT&&(Y=n.RG32UI),B===n.BYTE&&(Y=n.RG8I),B===n.SHORT&&(Y=n.RG16I),B===n.INT&&(Y=n.RG32I)),S===n.RGB_INTEGER&&(B===n.UNSIGNED_BYTE&&(Y=n.RGB8UI),B===n.UNSIGNED_SHORT&&(Y=n.RGB16UI),B===n.UNSIGNED_INT&&(Y=n.RGB32UI),B===n.BYTE&&(Y=n.RGB8I),B===n.SHORT&&(Y=n.RGB16I),B===n.INT&&(Y=n.RGB32I)),S===n.RGBA_INTEGER&&(B===n.UNSIGNED_BYTE&&(Y=n.RGBA8UI),B===n.UNSIGNED_SHORT&&(Y=n.RGBA16UI),B===n.UNSIGNED_INT&&(Y=n.RGBA32UI),B===n.BYTE&&(Y=n.RGBA8I),B===n.SHORT&&(Y=n.RGBA16I),B===n.INT&&(Y=n.RGBA32I)),S===n.RGB&&(B===n.UNSIGNED_SHORT&&de&&(Y=de.RGB16_EXT),B===n.SHORT&&de&&(Y=de.RGB16_SNORM_EXT),B===n.UNSIGNED_INT_5_9_9_9_REV&&(Y=n.RGB9_E5),B===n.UNSIGNED_INT_10F_11F_11F_REV&&(Y=n.R11F_G11F_B10F)),S===n.RGBA){let Z=ae?ko:qe.getTransfer(Q);B===n.FLOAT&&(Y=n.RGBA32F),B===n.HALF_FLOAT&&(Y=n.RGBA16F),B===n.UNSIGNED_BYTE&&(Y=Z===ot?n.SRGB8_ALPHA8:n.RGBA8),B===n.UNSIGNED_SHORT&&de&&(Y=de.RGBA16_EXT),B===n.SHORT&&de&&(Y=de.RGBA16_SNORM_EXT),B===n.UNSIGNED_SHORT_4_4_4_4&&(Y=n.RGBA4),B===n.UNSIGNED_SHORT_5_5_5_1&&(Y=n.RGB5_A1)}return(Y===n.R16F||Y===n.R32F||Y===n.RG16F||Y===n.RG32F||Y===n.RGBA16F||Y===n.RGBA32F)&&e.get("EXT_color_buffer_float"),Y}function v(R,S){let B;return R?S===null||S===ni||S===Wr?B=n.DEPTH24_STENCIL8:S===Nn?B=n.DEPTH32F_STENCIL8:S===zs&&(B=n.DEPTH24_STENCIL8,Ie("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):S===null||S===ni||S===Wr?B=n.DEPTH_COMPONENT24:S===Nn?B=n.DEPTH_COMPONENT32F:S===zs&&(B=n.DEPTH_COMPONENT16),B}function A(R,S){return _(R)===!0||R.isFramebufferTexture&&R.minFilter!==xt&&R.minFilter!==pn?Math.log2(Math.max(S.width,S.height))+1:R.mipmaps.length>0?R.mipmaps.length:R.isCompressedTexture&&Array.isArray(R.image)?S.mipmaps.length:1}function L(R){let S=new WeakRef(R);i.get(R).__ref=S,p.add(S),y.register(R,S,S)}function C(R){let S=i.get(R).__ref;S!==void 0&&(p.delete(S),y.unregister(S))}function k(R){j(R.target)}function H(R){I(R.target)}function j(R){R.removeEventListener("dispose",k),C(R),G(R),R.isVideoTexture&&h.delete(R),R.isHTMLTexture&&u.delete(R)}function I(R){R.removeEventListener("dispose",H),C(R),te(R)}function V(){for(let R of p){let S=R.deref();S!==void 0&&(S.isRenderTarget===!0?I(S):j(S))}p.clear(),u.clear()}function G(R){let S=i.get(R);if(S.__webglInit===void 0)return;let B=R.source,ie=d.get(B);if(ie){let Q=ie[S.__cacheKey];Q.usedTimes--,Q.usedTimes===0&&W(R),Object.keys(ie).length===0&&d.delete(B)}i.remove(R)}function W(R){let S=i.get(R);n.deleteTexture(S.__webglTexture);let B=R.source,ie=d.get(B);delete ie[S.__cacheKey],o.memory.textures--}function te(R){let S=i.get(R);S.__depthDisposeCallback&&S.__depthDisposeCallback();let B=R.depthTexture;if(B&&B.renderTarget===R&&j(B),R.isWebGLCubeRenderTarget)for(let Q=0;Q<6;Q++){if(Array.isArray(S.__webglFramebuffer[Q]))for(let ae=0;ae<S.__webglFramebuffer[Q].length;ae++)n.deleteFramebuffer(S.__webglFramebuffer[Q][ae]);else n.deleteFramebuffer(S.__webglFramebuffer[Q]);S.__webglDepthbuffer&&n.deleteRenderbuffer(S.__webglDepthbuffer[Q])}else{if(Array.isArray(S.__webglFramebuffer))for(let Q=0;Q<S.__webglFramebuffer.length;Q++)n.deleteFramebuffer(S.__webglFramebuffer[Q]);else n.deleteFramebuffer(S.__webglFramebuffer);if(S.__webglDepthbuffer&&n.deleteRenderbuffer(S.__webglDepthbuffer),S.__webglMultisampledFramebuffer&&n.deleteFramebuffer(S.__webglMultisampledFramebuffer),S.__webglColorRenderbuffer)for(let Q=0;Q<S.__webglColorRenderbuffer.length;Q++)S.__webglColorRenderbuffer[Q]&&n.deleteRenderbuffer(S.__webglColorRenderbuffer[Q]);S.__webglDepthRenderbuffer&&n.deleteRenderbuffer(S.__webglDepthRenderbuffer)}let ie=R.textures;for(let Q=0,ae=ie.length;Q<ae;Q++){let de=i.get(ie[Q]);de.__webglTexture&&(n.deleteTexture(de.__webglTexture),o.memory.textures--),i.remove(ie[Q])}i.remove(R)}let X=0;function ee(){X=0}function ne(){return X}function be(R){X=R}function ke(){let R=X;return R>=r.maxTextures&&Ie("WebGLTextures: Trying to use "+(R+1)+" texture units while this GPU supports only "+r.maxTextures),X+=1,R}function J(R){let S=[];return S.push(R.wrapS),S.push(R.wrapT),S.push(R.wrapR||0),S.push(R.magFilter),S.push(R.minFilter),S.push(R.anisotropy),S.push(R.internalFormat),S.push(R.format),S.push(R.type),S.push(R.generateMipmaps),S.push(R.mipmapsAutoUpdate),S.push(R.premultiplyAlpha),S.push(R.flipY),S.push(R.unpackAlignment),S.push(R.colorSpace),S.join()}function me(R,S){let B=i.get(R);if(R.isVideoTexture&&Ot(R),R.isRenderTargetTexture===!1&&R.isExternalTexture!==!0&&R.version>0&&B.__version!==R.version){let ie=R.image;if(ie===null)Ie("WebGLRenderer: Texture marked for update but no image data found.");else if(ie.complete===!1)Ie("WebGLRenderer: Texture marked for update but image is incomplete");else{Nt(B,R,S);return}}else R.isExternalTexture&&(B.__webglTexture=R.sourceTexture?R.sourceTexture:null);t.bindTexture(n.TEXTURE_2D,B.__webglTexture,n.TEXTURE0+S)}function Me(R,S){let B=i.get(R);if(R.isRenderTargetTexture===!1&&R.version>0&&B.__version!==R.version){Nt(B,R,S);return}else R.isExternalTexture&&(B.__webglTexture=R.sourceTexture?R.sourceTexture:null);t.bindTexture(n.TEXTURE_2D_ARRAY,B.__webglTexture,n.TEXTURE0+S)}function Le(R,S){let B=i.get(R);if(R.isRenderTargetTexture===!1&&R.version>0&&B.__version!==R.version){Nt(B,R,S);return}t.bindTexture(n.TEXTURE_3D,B.__webglTexture,n.TEXTURE0+S)}function xe(R,S){let B=i.get(R);if(R.version>0&&B.__version!==R.version){yn(B,R,S);return}t.bindTexture(n.TEXTURE_CUBE_MAP,B.__webglTexture,n.TEXTURE0+S)}let He={[$l]:n.REPEAT,[mi]:n.CLAMP_TO_EDGE,[jl]:n.MIRRORED_REPEAT},At={[xt]:n.NEAREST,[Qm]:n.NEAREST_MIPMAP_NEAREST,[Jo]:n.NEAREST_MIPMAP_LINEAR,[pn]:n.LINEAR,[yc]:n.LINEAR_MIPMAP_NEAREST,[Oi]:n.LINEAR_MIPMAP_LINEAR},Ne={[ig]:n.NEVER,[Td]:n.ALWAYS,[rg]:n.LESS,[wd]:n.LEQUAL,[sg]:n.EQUAL,[Ed]:n.GEQUAL,[og]:n.GREATER,[ag]:n.NOTEQUAL};function lt(R,S){if(S.type===Nn&&e.has("OES_texture_float_linear")===!1&&(S.magFilter===pn||S.magFilter===yc||S.magFilter===Jo||S.magFilter===Oi||S.minFilter===pn||S.minFilter===yc||S.minFilter===Jo||S.minFilter===Oi)&&Ie("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),n.texParameteri(R,n.TEXTURE_WRAP_S,He[S.wrapS]),n.texParameteri(R,n.TEXTURE_WRAP_T,He[S.wrapT]),(R===n.TEXTURE_3D||R===n.TEXTURE_2D_ARRAY)&&n.texParameteri(R,n.TEXTURE_WRAP_R,He[S.wrapR]),n.texParameteri(R,n.TEXTURE_MAG_FILTER,At[S.magFilter]),n.texParameteri(R,n.TEXTURE_MIN_FILTER,At[S.minFilter]),S.compareFunction&&(n.texParameteri(R,n.TEXTURE_COMPARE_MODE,n.COMPARE_REF_TO_TEXTURE),n.texParameteri(R,n.TEXTURE_COMPARE_FUNC,Ne[S.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(S.magFilter===xt||S.minFilter!==Jo&&S.minFilter!==Oi||S.type===Nn&&e.has("OES_texture_float_linear")===!1)return;if(S.anisotropy>1||i.get(S).__currentAnisotropy){let B=e.get("EXT_texture_filter_anisotropic");n.texParameterf(R,B.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(S.anisotropy,r.getMaxAnisotropy())),i.get(S).__currentAnisotropy=S.anisotropy}}}function ut(R,S){let B=!1;R.__webglInit===void 0&&(R.__webglInit=!0,S.addEventListener("dispose",k),L(S));let ie=S.source,Q=d.get(ie);Q===void 0&&(Q={},d.set(ie,Q));let ae=J(S);if(ae!==R.__cacheKey){Q[ae]===void 0&&(Q[ae]={texture:n.createTexture(),usedTimes:0},o.memory.textures++,B=!0),Q[ae].usedTimes++;let de=Q[R.__cacheKey];de!==void 0&&(Q[R.__cacheKey].usedTimes--,de.usedTimes===0&&W(S)),R.__cacheKey=ae,R.__webglTexture=Q[ae].texture}return B}function Je(R,S,B){return Math.floor(Math.floor(R/B)/S)}function Zt(R,S,B,ie){let ae=R.updateRanges;if(ae.length===0)t.texSubImage2D(n.TEXTURE_2D,0,0,0,S.width,S.height,B,ie,S.data);else{ae.sort((P,K)=>P.start-K.start);let de=0;for(let P=1;P<ae.length;P++){let K=ae[de],q=ae[P],he=K.start+K.count,oe=Je(q.start,S.width,4),le=Je(K.start,S.width,4);q.start<=he+1&&oe===le&&Je(q.start+q.count-1,S.width,4)===oe?K.count=Math.max(K.count,q.start+q.count-K.start):(++de,ae[de]=q)}ae.length=de+1;let Y=t.getParameter(n.UNPACK_ROW_LENGTH),Z=t.getParameter(n.UNPACK_SKIP_PIXELS),ce=t.getParameter(n.UNPACK_SKIP_ROWS);t.pixelStorei(n.UNPACK_ROW_LENGTH,S.width);for(let P=0,K=ae.length;P<K;P++){let q=ae[P],he=Math.floor(q.start/4),oe=Math.ceil(q.count/4),le=he%S.width,Ae=Math.floor(he/S.width),We=oe,se=1;t.pixelStorei(n.UNPACK_SKIP_PIXELS,le),t.pixelStorei(n.UNPACK_SKIP_ROWS,Ae),t.texSubImage2D(n.TEXTURE_2D,0,le,Ae,We,se,B,ie,S.data)}R.clearUpdateRanges(),t.pixelStorei(n.UNPACK_ROW_LENGTH,Y),t.pixelStorei(n.UNPACK_SKIP_PIXELS,Z),t.pixelStorei(n.UNPACK_SKIP_ROWS,ce)}}function Nt(R,S,B){let ie=n.TEXTURE_2D;(S.isDataArrayTexture||S.isCompressedArrayTexture)&&(ie=n.TEXTURE_2D_ARRAY),S.isData3DTexture&&(ie=n.TEXTURE_3D);let Q=ut(R,S),ae=S.source;t.bindTexture(ie,R.__webglTexture,n.TEXTURE0+B);let de=i.get(ae);if(ae.version!==de.__version||Q===!0){if(t.activeTexture(n.TEXTURE0+B),(typeof ImageBitmap<"u"&&S.image instanceof ImageBitmap)===!1){let se=qe.getPrimaries(qe.workingColorSpace),Ce=S.colorSpace===ri?null:qe.getPrimaries(S.colorSpace),Ve=S.colorSpace===ri||se===Ce?n.NONE:n.BROWSER_DEFAULT_WEBGL;t.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,S.flipY),t.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,S.premultiplyAlpha),t.pixelStorei(n.UNPACK_COLORSPACE_CONVERSION_WEBGL,Ve)}t.pixelStorei(n.UNPACK_ALIGNMENT,S.unpackAlignment);let Z=b(S.image,!1,r.maxTextureSize);Z=De(S,Z);let ce=s.convert(S.format,S.colorSpace),P=s.convert(S.type),K=E(S.internalFormat,ce,P,S.normalized,S.colorSpace,S.isVideoTexture);lt(ie,S);let q,he=S.mipmaps,oe=S.isVideoTexture!==!0,le=de.__version===void 0||Q===!0,Ae=ae.dataReady,We=A(S,Z);if(S.isDepthTexture)K=v(S.format===Fi,S.type),le&&(oe?t.texStorage2D(n.TEXTURE_2D,1,K,Z.width,Z.height):t.texImage2D(n.TEXTURE_2D,0,K,Z.width,Z.height,0,ce,P,null));else if(S.isDataTexture)if(he.length>0){oe&&le&&t.texStorage2D(n.TEXTURE_2D,We,K,he[0].width,he[0].height);for(let se=0,Ce=he.length;se<Ce;se++)q=he[se],oe?Ae&&t.texSubImage2D(n.TEXTURE_2D,se,0,0,q.width,q.height,ce,P,q.data):t.texImage2D(n.TEXTURE_2D,se,K,q.width,q.height,0,ce,P,q.data);S.generateMipmaps=!1}else oe?(le&&t.texStorage2D(n.TEXTURE_2D,We,K,Z.width,Z.height),Ae&&Zt(S,Z,ce,P)):t.texImage2D(n.TEXTURE_2D,0,K,Z.width,Z.height,0,ce,P,Z.data);else if(S.isCompressedTexture)if(S.isCompressedArrayTexture){oe&&le&&t.texStorage3D(n.TEXTURE_2D_ARRAY,We,K,he[0].width,he[0].height,Z.depth);for(let se=0,Ce=he.length;se<Ce;se++)if(q=he[se],S.format!==On)if(ce!==null)if(oe){if(Ae)if(S.layerUpdates.size>0){let Ve=Od(q.width,q.height,S.format,S.type);for(let ge of S.layerUpdates){let ct=q.data.subarray(ge*Ve/q.data.BYTES_PER_ELEMENT,(ge+1)*Ve/q.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(n.TEXTURE_2D_ARRAY,se,0,0,ge,q.width,q.height,1,ce,ct)}}else t.compressedTexSubImage3D(n.TEXTURE_2D_ARRAY,se,0,0,0,q.width,q.height,Z.depth,ce,q.data)}else t.compressedTexImage3D(n.TEXTURE_2D_ARRAY,se,K,q.width,q.height,Z.depth,0,q.data,0,0);else Ie("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else oe?Ae&&t.texSubImage3D(n.TEXTURE_2D_ARRAY,se,0,0,0,q.width,q.height,Z.depth,ce,P,q.data):t.texImage3D(n.TEXTURE_2D_ARRAY,se,K,q.width,q.height,Z.depth,0,ce,P,q.data);S.layerUpdates.size>0&&S.clearLayerUpdates()}else{oe&&le&&t.texStorage2D(n.TEXTURE_2D,We,K,he[0].width,he[0].height);for(let se=0,Ce=he.length;se<Ce;se++)q=he[se],S.format!==On?ce!==null?oe?Ae&&t.compressedTexSubImage2D(n.TEXTURE_2D,se,0,0,q.width,q.height,ce,q.data):t.compressedTexImage2D(n.TEXTURE_2D,se,K,q.width,q.height,0,q.data):Ie("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):oe?Ae&&t.texSubImage2D(n.TEXTURE_2D,se,0,0,q.width,q.height,ce,P,q.data):t.texImage2D(n.TEXTURE_2D,se,K,q.width,q.height,0,ce,P,q.data)}else if(S.isDataArrayTexture)if(oe){if(le&&t.texStorage3D(n.TEXTURE_2D_ARRAY,We,K,Z.width,Z.height,Z.depth),Ae)if(S.layerUpdates.size>0){let se=Od(Z.width,Z.height,S.format,S.type);for(let Ce of S.layerUpdates){let Ve=Z.data.subarray(Ce*se/Z.data.BYTES_PER_ELEMENT,(Ce+1)*se/Z.data.BYTES_PER_ELEMENT);t.texSubImage3D(n.TEXTURE_2D_ARRAY,0,0,0,Ce,Z.width,Z.height,1,ce,P,Ve)}S.clearLayerUpdates()}else t.texSubImage3D(n.TEXTURE_2D_ARRAY,0,0,0,0,Z.width,Z.height,Z.depth,ce,P,Z.data)}else t.texImage3D(n.TEXTURE_2D_ARRAY,0,K,Z.width,Z.height,Z.depth,0,ce,P,Z.data);else if(S.isData3DTexture)oe?(le&&t.texStorage3D(n.TEXTURE_3D,We,K,Z.width,Z.height,Z.depth),Ae&&t.texSubImage3D(n.TEXTURE_3D,0,0,0,0,Z.width,Z.height,Z.depth,ce,P,Z.data)):t.texImage3D(n.TEXTURE_3D,0,K,Z.width,Z.height,Z.depth,0,ce,P,Z.data);else if(S.isFramebufferTexture){if(le)if(oe)t.texStorage2D(n.TEXTURE_2D,We,K,Z.width,Z.height);else{let se=Z.width,Ce=Z.height;for(let Ve=0;Ve<We;Ve++)t.texImage2D(n.TEXTURE_2D,Ve,K,se,Ce,0,ce,P,null),se>>=1,Ce>>=1}}else if(S.isHTMLTexture){if("texElementImage2D"in n){let se=n.canvas;if(se.hasAttribute("layoutsubtree")||se.setAttribute("layoutsubtree","true"),Z.parentNode!==se){se.appendChild(Z),u.add(S),se.onpaint=Ce=>{let Ve=Ce.changedElements;for(let ge of u)Ve.includes(ge.image)&&(ge.needsUpdate=!0)},se.requestPaint();return}if(n.texElementImage2D.length===3)n.texElementImage2D(n.TEXTURE_2D,n.RGBA8,Z);else{let Ve=n.RGBA,ge=n.RGBA,ct=n.UNSIGNED_BYTE;n.texElementImage2D(n.TEXTURE_2D,0,Ve,ge,ct,Z)}n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE)}}else if(he.length>0){if(oe&&le){let se=Be(he[0]);t.texStorage2D(n.TEXTURE_2D,We,K,se.width,se.height)}for(let se=0,Ce=he.length;se<Ce;se++)q=he[se],oe?Ae&&t.texSubImage2D(n.TEXTURE_2D,se,0,0,ce,P,q):t.texImage2D(n.TEXTURE_2D,se,K,ce,P,q);S.generateMipmaps=!1}else if(oe){if(le){let se=Be(Z);t.texStorage2D(n.TEXTURE_2D,We,K,se.width,se.height)}Ae&&t.texSubImage2D(n.TEXTURE_2D,0,0,0,ce,P,Z)}else t.texImage2D(n.TEXTURE_2D,0,K,ce,P,Z);_(S)&&S.mipmapsAutoUpdate===!0&&x(ie),de.__version=ae.version,S.onUpdate&&S.onUpdate(S)}R.__version=S.version}function yn(R,S,B){if(S.image.length!==6)return;let ie=ut(R,S),Q=S.source;t.bindTexture(n.TEXTURE_CUBE_MAP,R.__webglTexture,n.TEXTURE0+B);let ae=i.get(Q);if(Q.version!==ae.__version||ie===!0){t.activeTexture(n.TEXTURE0+B);let de=qe.getPrimaries(qe.workingColorSpace),Y=S.colorSpace===ri?null:qe.getPrimaries(S.colorSpace),Z=S.colorSpace===ri||de===Y?n.NONE:n.BROWSER_DEFAULT_WEBGL;t.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,S.flipY),t.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,S.premultiplyAlpha),t.pixelStorei(n.UNPACK_ALIGNMENT,S.unpackAlignment),t.pixelStorei(n.UNPACK_COLORSPACE_CONVERSION_WEBGL,Z);let ce=S.isCompressedTexture||S.image[0].isCompressedTexture,P=S.image[0]&&S.image[0].isDataTexture,K=[];for(let ge=0;ge<6;ge++)!ce&&!P?K[ge]=b(S.image[ge],!0,r.maxCubemapSize):K[ge]=P?S.image[ge].image:S.image[ge],K[ge]=De(S,K[ge]);let q=K[0],he=s.convert(S.format,S.colorSpace),oe=s.convert(S.type),le=E(S.internalFormat,he,oe,S.normalized,S.colorSpace),Ae=S.isVideoTexture!==!0,We=ae.__version===void 0||ie===!0,se=Q.dataReady,Ce=A(S,q);lt(n.TEXTURE_CUBE_MAP,S);let Ve;if(S.isDepthTexture){if(le=v(S.format===Fi,S.type),We)if(Ae)t.texStorage2D(n.TEXTURE_CUBE_MAP,1,le,q.width,q.height);else for(let ge=0;ge<6;ge++)t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,0,le,q.width,q.height,0,he,oe,null)}else if(ce){Ae&&We&&t.texStorage2D(n.TEXTURE_CUBE_MAP,Ce,le,q.width,q.height);for(let ge=0;ge<6;ge++){Ve=K[ge].mipmaps;for(let ct=0;ct<Ve.length;ct++){let Gt=Ve[ct];S.format!==On?he!==null?Ae?se&&t.compressedTexSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,ct,0,0,Gt.width,Gt.height,he,Gt.data):t.compressedTexImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,ct,le,Gt.width,Gt.height,0,Gt.data):Ie("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):Ae?se&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,ct,0,0,Gt.width,Gt.height,he,oe,Gt.data):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,ct,le,Gt.width,Gt.height,0,he,oe,Gt.data)}}}else{if(Ve=S.mipmaps,Ae&&We){Ve.length>0&&Ce++;let ge=Be(K[0]);t.texStorage2D(n.TEXTURE_CUBE_MAP,Ce,le,ge.width,ge.height)}for(let ge=0;ge<6;ge++)if(P){Ae?se&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,0,0,0,K[ge].width,K[ge].height,he,oe,K[ge].data):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,0,le,K[ge].width,K[ge].height,0,he,oe,K[ge].data);for(let ct=0;ct<Ve.length;ct++){let Bi=Ve[ct].image[ge].image;Ae?se&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,ct+1,0,0,Bi.width,Bi.height,he,oe,Bi.data):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,ct+1,le,Bi.width,Bi.height,0,he,oe,Bi.data)}}else{Ae?se&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,0,0,0,he,oe,K[ge]):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,0,le,he,oe,K[ge]);for(let ct=0;ct<Ve.length;ct++){let Gt=Ve[ct];Ae?se&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,ct+1,0,0,he,oe,Gt.image[ge]):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,ct+1,le,he,oe,Gt.image[ge])}}}_(S)&&S.mipmapsAutoUpdate===!0&&x(n.TEXTURE_CUBE_MAP),ae.__version=Q.version,S.onUpdate&&S.onUpdate(S)}R.__version=S.version}function _t(R,S,B,ie,Q,ae){let de=s.convert(B.format,B.colorSpace),Y=s.convert(B.type),Z=E(B.internalFormat,de,Y,B.normalized,B.colorSpace),ce=i.get(S),P=i.get(B);if(P.__renderTarget=S,!ce.__hasExternalTextures){let K=Math.max(1,S.width>>ae),q=Math.max(1,S.height>>ae);Q===n.TEXTURE_3D||Q===n.TEXTURE_2D_ARRAY?t.texImage3D(Q,ae,Z,K,q,S.depth,0,de,Y,null):t.texImage2D(Q,ae,Z,K,q,0,de,Y,null)}t.bindFramebuffer(n.FRAMEBUFFER,R),pe(S)?a.framebufferTexture2DMultisampleEXT(n.FRAMEBUFFER,ie,Q,P.__webglTexture,0,bt(S)):(Q===n.TEXTURE_2D||Q>=n.TEXTURE_CUBE_MAP_POSITIVE_X&&Q<=n.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&n.framebufferTexture2D(n.FRAMEBUFFER,ie,Q,P.__webglTexture,ae),t.bindFramebuffer(n.FRAMEBUFFER,null)}function ai(R,S,B){if(n.bindRenderbuffer(n.RENDERBUFFER,R),S.depthBuffer){let ie=S.depthTexture,Q=ie&&ie.isDepthTexture?ie.type:null,ae=v(S.stencilBuffer,Q),de=S.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT;pe(S)?a.renderbufferStorageMultisampleEXT(n.RENDERBUFFER,bt(S),ae,S.width,S.height):B?n.renderbufferStorageMultisample(n.RENDERBUFFER,bt(S),ae,S.width,S.height):n.renderbufferStorage(n.RENDERBUFFER,ae,S.width,S.height),n.framebufferRenderbuffer(n.FRAMEBUFFER,de,n.RENDERBUFFER,R)}else{let ie=S.textures;for(let Q=0;Q<ie.length;Q++){let ae=ie[Q],de=s.convert(ae.format,ae.colorSpace),Y=s.convert(ae.type),Z=E(ae.internalFormat,de,Y,ae.normalized,ae.colorSpace);pe(S)?a.renderbufferStorageMultisampleEXT(n.RENDERBUFFER,bt(S),Z,S.width,S.height):B?n.renderbufferStorageMultisample(n.RENDERBUFFER,bt(S),Z,S.width,S.height):n.renderbufferStorage(n.RENDERBUFFER,Z,S.width,S.height)}}n.bindRenderbuffer(n.RENDERBUFFER,null)}function Vt(R,S,B){let ie=S.isWebGLCubeRenderTarget===!0;if(t.bindFramebuffer(n.FRAMEBUFFER,R),!(S.depthTexture&&S.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");let Q=i.get(S.depthTexture);Q.__renderTarget=S;let ae=ie?S.depthTexture.image[0]:S.depthTexture.image;(!Q.__webglTexture||ae.width!==S.width||ae.height!==S.height)&&(ae.width=S.width,ae.height=S.height,S.depthTexture.needsUpdate=!0),ie?xe(S.depthTexture,0):me(S.depthTexture,0);let de=Q.__webglTexture,Y=bt(S),Z=ie?n.TEXTURE_CUBE_MAP_POSITIVE_X+B:n.TEXTURE_2D,ce=S.depthTexture.format===Fi?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT;if(S.depthTexture.format===Li)pe(S)?a.framebufferTexture2DMultisampleEXT(n.FRAMEBUFFER,ce,Z,de,0,Y):n.framebufferTexture2D(n.FRAMEBUFFER,ce,Z,de,0);else if(S.depthTexture.format===Fi)pe(S)?a.framebufferTexture2DMultisampleEXT(n.FRAMEBUFFER,ce,Z,de,0,Y):n.framebufferTexture2D(n.FRAMEBUFFER,ce,Z,de,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function Fn(R){let S=i.get(R),B=R.isWebGLCubeRenderTarget===!0;if(S.__boundDepthTexture!==R.depthTexture){let ie=R.depthTexture;if(S.__depthDisposeCallback&&S.__depthDisposeCallback(),ie){let Q=()=>{delete S.__boundDepthTexture,delete S.__depthDisposeCallback,ie.removeEventListener("dispose",Q)};ie.addEventListener("dispose",Q),S.__depthDisposeCallback=Q}S.__boundDepthTexture=ie}if(R.depthTexture&&!S.__autoAllocateDepthBuffer)if(B)for(let ie=0;ie<6;ie++)Vt(S.__webglFramebuffer[ie],R,ie);else R.texture.mipmaps.length>0?Vt(S.__webglFramebuffer[0],R,0):Vt(S.__webglFramebuffer,R,0);else if(B){S.__webglDepthbuffer=[];for(let ie=0;ie<6;ie++)if(t.bindFramebuffer(n.FRAMEBUFFER,S.__webglFramebuffer[ie]),S.__webglDepthbuffer[ie]===void 0)S.__webglDepthbuffer[ie]=n.createRenderbuffer(),ai(S.__webglDepthbuffer[ie],R,!1);else{let Q=R.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,ae=S.__webglDepthbuffer[ie];n.bindRenderbuffer(n.RENDERBUFFER,ae),n.framebufferRenderbuffer(n.FRAMEBUFFER,Q,n.RENDERBUFFER,ae)}}else if(R.texture.mipmaps.length>0?t.bindFramebuffer(n.FRAMEBUFFER,S.__webglFramebuffer[0]):t.bindFramebuffer(n.FRAMEBUFFER,S.__webglFramebuffer),S.__webglDepthbuffer===void 0)S.__webglDepthbuffer=n.createRenderbuffer(),ai(S.__webglDepthbuffer,R,!1);else{let Q=R.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,ae=S.__webglDepthbuffer;n.bindRenderbuffer(n.RENDERBUFFER,ae),n.framebufferRenderbuffer(n.FRAMEBUFFER,Q,n.RENDERBUFFER,ae)}t.bindFramebuffer(n.FRAMEBUFFER,null)}function Un(R,S,B){let ie=i.get(R);S!==void 0&&_t(ie.__webglFramebuffer,R,R.texture,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,0),B!==void 0&&Fn(R)}function Bn(R){let S=R.texture,B=i.get(R),ie=i.get(S);R.addEventListener("dispose",H),L(R);let Q=R.textures,ae=R.isWebGLCubeRenderTarget===!0,de=Q.length>1;if(de||(ie.__webglTexture===void 0&&(ie.__webglTexture=n.createTexture()),ie.__version=S.version,o.memory.textures++),ae){B.__webglFramebuffer=[];for(let Y=0;Y<6;Y++)if(S.mipmaps.length>0){B.__webglFramebuffer[Y]=[];for(let Z=0;Z<S.mipmaps.length;Z++)B.__webglFramebuffer[Y][Z]=n.createFramebuffer()}else B.__webglFramebuffer[Y]=n.createFramebuffer()}else{if(S.mipmaps.length>0){B.__webglFramebuffer=[];for(let Y=0;Y<S.mipmaps.length;Y++)B.__webglFramebuffer[Y]=n.createFramebuffer()}else B.__webglFramebuffer=n.createFramebuffer();if(de)for(let Y=0,Z=Q.length;Y<Z;Y++){let ce=i.get(Q[Y]);ce.__webglTexture===void 0&&(ce.__webglTexture=n.createTexture(),o.memory.textures++)}if(R.samples>0&&pe(R)===!1){B.__webglMultisampledFramebuffer=n.createFramebuffer(),B.__webglColorRenderbuffer=[],t.bindFramebuffer(n.FRAMEBUFFER,B.__webglMultisampledFramebuffer);for(let Y=0;Y<Q.length;Y++){let Z=Q[Y];B.__webglColorRenderbuffer[Y]=n.createRenderbuffer(),n.bindRenderbuffer(n.RENDERBUFFER,B.__webglColorRenderbuffer[Y]);let ce=s.convert(Z.format,Z.colorSpace),P=s.convert(Z.type),K=E(Z.internalFormat,ce,P,Z.normalized,Z.colorSpace,R.isXRRenderTarget===!0),q=bt(R);n.renderbufferStorageMultisample(n.RENDERBUFFER,q,K,R.width,R.height),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+Y,n.RENDERBUFFER,B.__webglColorRenderbuffer[Y])}n.bindRenderbuffer(n.RENDERBUFFER,null),R.depthBuffer&&(B.__webglDepthRenderbuffer=n.createRenderbuffer(),ai(B.__webglDepthRenderbuffer,R,!0)),t.bindFramebuffer(n.FRAMEBUFFER,null)}}if(ae){t.bindTexture(n.TEXTURE_CUBE_MAP,ie.__webglTexture),lt(n.TEXTURE_CUBE_MAP,S);for(let Y=0;Y<6;Y++)if(S.mipmaps.length>0)for(let Z=0;Z<S.mipmaps.length;Z++)_t(B.__webglFramebuffer[Y][Z],R,S,n.COLOR_ATTACHMENT0,n.TEXTURE_CUBE_MAP_POSITIVE_X+Y,Z);else _t(B.__webglFramebuffer[Y],R,S,n.COLOR_ATTACHMENT0,n.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0);_(S)?x(n.TEXTURE_CUBE_MAP):S.mipmaps.length>0&&n.texParameteri(n.TEXTURE_CUBE_MAP,n.TEXTURE_MAX_LEVEL,S.mipmaps.length-1),t.unbindTexture()}else if(de){for(let Y=0,Z=Q.length;Y<Z;Y++){let ce=Q[Y],P=i.get(ce),K=n.TEXTURE_2D;(R.isWebGL3DRenderTarget||R.isWebGLArrayRenderTarget)&&(K=R.isWebGL3DRenderTarget?n.TEXTURE_3D:n.TEXTURE_2D_ARRAY),t.bindTexture(K,P.__webglTexture),lt(K,ce),_t(B.__webglFramebuffer,R,ce,n.COLOR_ATTACHMENT0+Y,K,0),_(ce)&&x(K)}t.unbindTexture()}else{let Y=n.TEXTURE_2D;if((R.isWebGL3DRenderTarget||R.isWebGLArrayRenderTarget)&&(Y=R.isWebGL3DRenderTarget?n.TEXTURE_3D:n.TEXTURE_2D_ARRAY),t.bindTexture(Y,ie.__webglTexture),lt(Y,S),S.mipmaps.length>0)for(let Z=0;Z<S.mipmaps.length;Z++)_t(B.__webglFramebuffer[Z],R,S,n.COLOR_ATTACHMENT0,Y,Z);else _t(B.__webglFramebuffer,R,S,n.COLOR_ATTACHMENT0,Y,0);_(S)?x(Y):S.mipmaps.length>0&&n.texParameteri(Y,n.TEXTURE_MAX_LEVEL,S.mipmaps.length-1),t.unbindTexture()}R.depthBuffer&&Fn(R)}function F(R){let S=R.textures;for(let B=0,ie=S.length;B<ie;B++){let Q=S[B];if(_(Q)&&Q.mipmapsAutoUpdate===!0){let ae=M(R),de=i.get(Q).__webglTexture;t.bindTexture(ae,de),x(ae),t.unbindTexture()}}}let zn=[];function yt(R){if(R.samples>0){if(pe(R)===!1){let S=R.textures,B=R.width,ie=R.height,Q=n.COLOR_BUFFER_BIT,ae=R.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,de=i.get(R),Y=S.length>1;if(Y)for(let ce=0;ce<S.length;ce++)t.bindFramebuffer(n.FRAMEBUFFER,de.__webglMultisampledFramebuffer),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+ce,n.RENDERBUFFER,null),t.bindFramebuffer(n.FRAMEBUFFER,de.__webglFramebuffer),n.framebufferTexture2D(n.DRAW_FRAMEBUFFER,n.COLOR_ATTACHMENT0+ce,n.TEXTURE_2D,null,0);t.bindFramebuffer(n.READ_FRAMEBUFFER,de.__webglMultisampledFramebuffer),R.texture.mipmaps.length>0?t.bindFramebuffer(n.DRAW_FRAMEBUFFER,de.__webglFramebuffer[0]):t.bindFramebuffer(n.DRAW_FRAMEBUFFER,de.__webglFramebuffer);for(let ce=0;ce<S.length;ce++){if(R.resolveDepthBuffer&&(R.depthBuffer&&(Q|=n.DEPTH_BUFFER_BIT),R.stencilBuffer&&R.resolveStencilBuffer&&(Q|=n.STENCIL_BUFFER_BIT)),Y){n.framebufferRenderbuffer(n.READ_FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.RENDERBUFFER,de.__webglColorRenderbuffer[ce]);let P=i.get(S[ce]).__webglTexture;n.framebufferTexture2D(n.DRAW_FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,P,0)}n.blitFramebuffer(0,0,B,ie,0,0,B,ie,Q,n.NEAREST),l===!0&&(zn.length=0,zn.push(n.COLOR_ATTACHMENT0+ce),R.depthBuffer&&R.storeMultisampledDepthBuffer===!1&&zn.push(ae),n.invalidateFramebuffer(n.READ_FRAMEBUFFER,zn))}if(t.bindFramebuffer(n.READ_FRAMEBUFFER,null),t.bindFramebuffer(n.DRAW_FRAMEBUFFER,null),Y)for(let ce=0;ce<S.length;ce++){t.bindFramebuffer(n.FRAMEBUFFER,de.__webglMultisampledFramebuffer),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+ce,n.RENDERBUFFER,de.__webglColorRenderbuffer[ce]);let P=i.get(S[ce]).__webglTexture;t.bindFramebuffer(n.FRAMEBUFFER,de.__webglFramebuffer),n.framebufferTexture2D(n.DRAW_FRAMEBUFFER,n.COLOR_ATTACHMENT0+ce,n.TEXTURE_2D,P,0)}t.bindFramebuffer(n.DRAW_FRAMEBUFFER,de.__webglMultisampledFramebuffer)}else if(R.depthBuffer&&R.storeMultisampledDepthBuffer===!1&&l){let S=R.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT;n.invalidateFramebuffer(n.DRAW_FRAMEBUFFER,[S])}}}function bt(R){return Math.min(r.maxSamples,R.samples)}function pe(R){let S=i.get(R);return R.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&S.__useRenderToTexture!==!1}function Ot(R){let S=o.render.frame;h.get(R)!==S&&(h.set(R,S),R.update())}function De(R,S){let B=R.colorSpace,ie=R.format,Q=R.type;return R.isCompressedTexture===!0||R.isVideoTexture===!0||B!==Or&&B!==ri&&(qe.getTransfer(B)===ot?(ie!==On||Q!==kn)&&Ie("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):Fe("WebGLTextures: Unsupported texture color space:",B)),S}function Be(R){return typeof HTMLImageElement<"u"&&R instanceof HTMLImageElement?(c.width=R.naturalWidth||R.width,c.height=R.naturalHeight||R.height):typeof VideoFrame<"u"&&R instanceof VideoFrame?(c.width=R.displayWidth,c.height=R.displayHeight):(c.width=R.width,c.height=R.height),c}this.allocateTextureUnit=ke,this.resetTextureUnits=ee,this.getTextureUnits=ne,this.setTextureUnits=be,this.setTexture2D=me,this.setTexture2DArray=Me,this.setTexture3D=Le,this.setTextureCube=xe,this.rebindTextures=Un,this.setupRenderTarget=Bn,this.updateRenderTargetMipmap=F,this.updateMultisampleRenderTarget=yt,this.setupDepthRenderbuffer=Fn,this.setupFrameBufferTexture=_t,this.useMultisampledRTT=pe,this.dispose=V}function Iw(n,e){function t(i,r=ri){let s,o=qe.getTransfer(r);if(i===kn)return n.UNSIGNED_BYTE;if(i===xc)return n.UNSIGNED_SHORT_4_4_4_4;if(i===vc)return n.UNSIGNED_SHORT_5_5_5_1;if(i===gd)return n.UNSIGNED_INT_5_9_9_9_REV;if(i===yd)return n.UNSIGNED_INT_10F_11F_11F_REV;if(i===pd)return n.BYTE;if(i===md)return n.SHORT;if(i===zs)return n.UNSIGNED_SHORT;if(i===bc)return n.INT;if(i===ni)return n.UNSIGNED_INT;if(i===Nn)return n.FLOAT;if(i===ii)return n.HALF_FLOAT;if(i===bd)return n.ALPHA;if(i===xd)return n.RGB;if(i===On)return n.RGBA;if(i===Li)return n.DEPTH_COMPONENT;if(i===Fi)return n.DEPTH_STENCIL;if(i===vd)return n.RED;if(i===_c)return n.RED_INTEGER;if(i===hr)return n.RG;if(i===Sc)return n.RG_INTEGER;if(i===Mc)return n.RGBA_INTEGER;if(i===Zo||i===Ko||i===Qo||i===ea)if(o===ot)if(s=e.get("WEBGL_compressed_texture_s3tc_srgb"),s!==null){if(i===Zo)return s.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(i===Ko)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(i===Qo)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(i===ea)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(s=e.get("WEBGL_compressed_texture_s3tc"),s!==null){if(i===Zo)return s.COMPRESSED_RGB_S3TC_DXT1_EXT;if(i===Ko)return s.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(i===Qo)return s.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(i===ea)return s.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(i===wc||i===Ec||i===Tc||i===Ac)if(s=e.get("WEBGL_compressed_texture_pvrtc"),s!==null){if(i===wc)return s.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(i===Ec)return s.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(i===Tc)return s.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(i===Ac)return s.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(i===Rc||i===Cc||i===Pc||i===Ic||i===Lc||i===ta||i===Dc)if(s=e.get("WEBGL_compressed_texture_etc"),s!==null){if(i===Rc||i===Cc)return o===ot?s.COMPRESSED_SRGB8_ETC2:s.COMPRESSED_RGB8_ETC2;if(i===Pc)return o===ot?s.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:s.COMPRESSED_RGBA8_ETC2_EAC;if(i===Ic)return s.COMPRESSED_R11_EAC;if(i===Lc)return s.COMPRESSED_SIGNED_R11_EAC;if(i===ta)return s.COMPRESSED_RG11_EAC;if(i===Dc)return s.COMPRESSED_SIGNED_RG11_EAC}else return null;if(i===kc||i===Nc||i===Oc||i===Fc||i===Uc||i===Bc||i===zc||i===Hc||i===Vc||i===Gc||i===Wc||i===$c||i===jc||i===Xc)if(s=e.get("WEBGL_compressed_texture_astc"),s!==null){if(i===kc)return o===ot?s.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:s.COMPRESSED_RGBA_ASTC_4x4_KHR;if(i===Nc)return o===ot?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:s.COMPRESSED_RGBA_ASTC_5x4_KHR;if(i===Oc)return o===ot?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:s.COMPRESSED_RGBA_ASTC_5x5_KHR;if(i===Fc)return o===ot?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:s.COMPRESSED_RGBA_ASTC_6x5_KHR;if(i===Uc)return o===ot?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:s.COMPRESSED_RGBA_ASTC_6x6_KHR;if(i===Bc)return o===ot?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:s.COMPRESSED_RGBA_ASTC_8x5_KHR;if(i===zc)return o===ot?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:s.COMPRESSED_RGBA_ASTC_8x6_KHR;if(i===Hc)return o===ot?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:s.COMPRESSED_RGBA_ASTC_8x8_KHR;if(i===Vc)return o===ot?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:s.COMPRESSED_RGBA_ASTC_10x5_KHR;if(i===Gc)return o===ot?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:s.COMPRESSED_RGBA_ASTC_10x6_KHR;if(i===Wc)return o===ot?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:s.COMPRESSED_RGBA_ASTC_10x8_KHR;if(i===$c)return o===ot?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:s.COMPRESSED_RGBA_ASTC_10x10_KHR;if(i===jc)return o===ot?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:s.COMPRESSED_RGBA_ASTC_12x10_KHR;if(i===Xc)return o===ot?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:s.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(i===qc||i===Yc||i===Jc)if(s=e.get("EXT_texture_compression_bptc"),s!==null){if(i===qc)return o===ot?s.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:s.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(i===Yc)return s.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(i===Jc)return s.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(i===Zc||i===Kc||i===na||i===Qc)if(s=e.get("EXT_texture_compression_rgtc"),s!==null){if(i===Zc)return s.COMPRESSED_RED_RGTC1_EXT;if(i===Kc)return s.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(i===na)return s.COMPRESSED_RED_GREEN_RGTC2_EXT;if(i===Qc)return s.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return i===Wr?n.UNSIGNED_INT_24_8:n[i]!==void 0?n[i]:null}return{convert:t}}var Lw=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Dw=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,$d=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){let i=new Wo(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=i}}getMesh(e){if(this.texture!==null&&this.mesh===null){let t=e.cameras[0].viewport,i=new Pn({vertexShader:Lw,fragmentShader:Dw,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new Jt(new Hr(20,20),i)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},jd=class extends Qn{constructor(e,t){super();let i=this,r=null,s=1,o=null,a="local-floor",l=1,c=null,h=null,u=null,f=null,d=null,p=null,y=typeof XRWebGLBinding<"u",m=new $d,g={},b=t.getContextAttributes(),_=null,x=null,M=[],E=[],v=new Pe,A=null,L=null,C=new cn;C.viewport=new at;let k=new cn;k.viewport=new at;let H=[C,k],j=new pc,I=null,V=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(J){let me=M[J];return me===void 0&&(me=new Ts,M[J]=me),me.getTargetRaySpace()},this.getControllerGrip=function(J){let me=M[J];return me===void 0&&(me=new Ts,M[J]=me),me.getGripSpace()},this.getHand=function(J){let me=M[J];return me===void 0&&(me=new Ts,M[J]=me),me.getHandSpace()};function G(J){let me=E.indexOf(J.inputSource);if(me===-1)return;let Me=M[me];Me!==void 0&&(Me.update(J.inputSource,J.frame,c||o),Me.dispatchEvent({type:J.type,data:J.inputSource}))}function W(){r.removeEventListener("select",G),r.removeEventListener("selectstart",G),r.removeEventListener("selectend",G),r.removeEventListener("squeeze",G),r.removeEventListener("squeezestart",G),r.removeEventListener("squeezeend",G),r.removeEventListener("end",W),r.removeEventListener("inputsourceschange",te);for(let J=0;J<M.length;J++){let me=E[J];me!==null&&(E[J]=null,M[J].disconnect(me))}I=null,V=null,m.reset();for(let J in g)delete g[J];if(e.setRenderTarget(_),d=null,f=null,u=null,r=null,x=null,ke.stop(),i.isPresenting=!1,e.setPixelRatio(A),e.setSize(v.width,v.height,!1),L!==null){let J=L.camera;J.fov=L.fov,J.zoom=L.zoom,J.updateProjectionMatrix(),L=null}i.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(J){s=J,i.isPresenting===!0&&Ie("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(J){a=J,i.isPresenting===!0&&Ie("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||o},this.setReferenceSpace=function(J){c=J},this.getBaseLayer=function(){return f!==null?f:d},this.getBinding=function(){return u===null&&y&&(u=new XRWebGLBinding(r,t)),u},this.getFrame=function(){return p},this.getSession=function(){return r},this.setSession=async function(J){if(r=J,r!==null){if(_=e.getRenderTarget(),r.addEventListener("select",G),r.addEventListener("selectstart",G),r.addEventListener("selectend",G),r.addEventListener("squeeze",G),r.addEventListener("squeezestart",G),r.addEventListener("squeezeend",G),r.addEventListener("end",W),r.addEventListener("inputsourceschange",te),b.xrCompatible!==!0&&await t.makeXRCompatible(),A=e.getPixelRatio(),e.getSize(v),y&&"createProjectionLayer"in XRWebGLBinding.prototype){let Me=null,Le=null,xe=null;b.depth&&(xe=b.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,Me=b.stencil?Fi:Li,Le=b.stencil?Wr:ni);let He={colorFormat:t.RGBA8,depthFormat:xe,scaleFactor:s};u=this.getBinding(),f=u.createProjectionLayer(He),r.updateRenderState({layers:[f]}),e.setPixelRatio(1),e.setSize(f.textureWidth,f.textureHeight,!1),x=new mn(f.textureWidth,f.textureHeight,{format:On,type:kn,depthTexture:new ki(f.textureWidth,f.textureHeight,Le,void 0,void 0,void 0,void 0,void 0,void 0,Me),stencilBuffer:b.stencil,colorSpace:e.outputColorSpace,samples:b.antialias?4:0,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1,storeMultisampledDepthBuffer:f.ignoreDepthValues===!1,storeMultisampledStencilBuffer:f.ignoreDepthValues===!1})}else{let Me={antialias:b.antialias,alpha:!0,depth:b.depth,stencil:b.stencil,framebufferScaleFactor:s};d=new XRWebGLLayer(r,t,Me),r.updateRenderState({baseLayer:d}),e.setPixelRatio(1),e.setSize(d.framebufferWidth,d.framebufferHeight,!1),x=new mn(d.framebufferWidth,d.framebufferHeight,{format:On,type:kn,colorSpace:e.outputColorSpace,stencilBuffer:b.stencil,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1,storeMultisampledDepthBuffer:d.ignoreDepthValues===!1,storeMultisampledStencilBuffer:d.ignoreDepthValues===!1})}x.isXRRenderTarget=!0,this.setFoveation(l),c=null,o=await r.requestReferenceSpace(a),ke.setContext(r),ke.start(),i.isPresenting=!0,i.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(r!==null)return r.environmentBlendMode},this.getDepthTexture=function(){return m.getDepthTexture()};function te(J){for(let me=0;me<J.removed.length;me++){let Me=J.removed[me],Le=E.indexOf(Me);Le>=0&&(E[Le]=null,M[Le].disconnect(Me))}for(let me=0;me<J.added.length;me++){let Me=J.added[me],Le=E.indexOf(Me);if(Le===-1){for(let He=0;He<M.length;He++)if(He>=E.length){E.push(Me),Le=He;break}else if(E[He]===null){E[He]=Me,Le=He;break}if(Le===-1)break}let xe=M[Le];xe&&xe.connect(Me)}}function X(J,me){me===null?J.matrixWorld.copy(J.matrix):J.matrixWorld.multiplyMatrices(me.matrixWorld,J.matrix),J.matrixWorldInverse.copy(J.matrixWorld).invert()}this.updateCamera=function(J){if(r===null)return;let me=J.near,Me=J.far;m.texture!==null&&(m.depthNear>0&&(me=m.depthNear),m.depthFar>0&&(Me=m.depthFar)),j.near=k.near=C.near=me,j.far=k.far=C.far=Me,(I!==j.near||V!==j.far)&&(r.updateRenderState({depthNear:j.near,depthFar:j.far}),I=j.near,V=j.far),j.layers.mask=J.layers.mask|6,C.layers.mask=j.layers.mask&-5,k.layers.mask=j.layers.mask&-3;let Le=J.parent,xe=j.cameras;X(j,Le);for(let He=0;He<xe.length;He++)X(xe[He],Le);j.projectionMatrix.copy(C.projectionMatrix),j.projectionMatrixInverse.copy(C.projectionMatrixInverse),L===null&&J.isPerspectiveCamera&&(L={camera:J,fov:J.fov,zoom:J.zoom}),ee(J,j,Le)};function ee(J,me,Me){Me===null?J.matrix.copy(me.matrixWorld):(J.matrix.copy(Me.matrixWorld),J.matrix.invert(),J.matrix.multiply(me.matrixWorld)),J.matrix.decompose(J.position,J.quaternion,J.scale),J.updateMatrixWorld(!0),J.projectionMatrix.copy(me.projectionMatrix),J.projectionMatrixInverse.copy(me.projectionMatrixInverse),J.isPerspectiveCamera&&(J.fov=ws*2*Math.atan(1/J.projectionMatrix.elements[5]),J.zoom=1)}this.getCamera=function(){return j},this.getFoveation=function(){if(!(f===null&&d===null))return l},this.setFoveation=function(J){l=J,f!==null&&(f.fixedFoveation=J),d!==null&&d.fixedFoveation!==void 0&&(d.fixedFoveation=J)},this.hasDepthSensing=function(){return m.texture!==null},this.getDepthSensingMesh=function(){return m.getMesh(j)},this.getCameraTexture=function(J){return g[J]};let ne=null;function be(J,me){if(h=me.getViewerPose(c||o),p=me,h!==null){let Me=h.views;d!==null&&(e.setRenderTargetFramebuffer(x,d.framebuffer),e.setRenderTarget(x));let Le=!1;Me.length!==j.cameras.length&&(j.cameras.length=0,Le=!0);for(let Ne=0;Ne<Me.length;Ne++){let lt=Me[Ne],ut=null;if(d!==null)ut=d.getViewport(lt);else{let Zt=u.getViewSubImage(f,lt);ut=Zt.viewport,Ne===0&&(e.setRenderTargetTextures(x,Zt.colorTexture,Zt.depthStencilTexture),e.setRenderTarget(x))}let Je=H[Ne];Je===void 0&&(Je=new cn,Je.layers.enable(Ne),Je.viewport=new at,H[Ne]=Je),Je.matrix.fromArray(lt.transform.matrix),Je.matrix.decompose(Je.position,Je.quaternion,Je.scale),Je.projectionMatrix.fromArray(lt.projectionMatrix),Je.projectionMatrixInverse.copy(Je.projectionMatrix).invert(),Je.viewport.set(ut.x,ut.y,ut.width,ut.height),Ne===0&&(j.matrix.copy(Je.matrix),j.matrix.decompose(j.position,j.quaternion,j.scale)),Le===!0&&j.cameras.push(Je)}let xe=r.enabledFeatures;if(xe&&xe.includes("depth-sensing")&&r.depthUsage=="gpu-optimized"&&y){u=i.getBinding();let Ne=u.getDepthInformation(Me[0]);Ne&&Ne.isValid&&Ne.texture&&m.init(Ne,r.renderState)}if(xe&&xe.includes("camera-access")&&y){e.state.unbindTexture(),u=i.getBinding();for(let Ne=0;Ne<Me.length;Ne++){let lt=Me[Ne].camera;if(lt){let ut=g[lt];ut||(ut=new Wo,g[lt]=ut);let Je=u.getCameraImage(lt);ut.sourceTexture=Je}}}}for(let Me=0;Me<M.length;Me++){let Le=E[Me],xe=M[Me];Le!==null&&xe!==void 0&&xe.update(Le,me,c||o)}ne&&ne(J,me),me.detectedPlanes&&i.dispatchEvent({type:"planesdetected",data:me}),p=null}let ke=new Fg;ke.setAnimationLoop(be),this.setAnimationLoop=function(J){ne=J},this.dispose=function(){}}},kw=new ft,Xg=new Ue;Xg.set(-1,0,0,0,1,0,0,0,1);function Nw(n,e){function t(m,g){m.matrixAutoUpdate===!0&&m.updateMatrix(),g.value.copy(m.matrix)}function i(m,g){g.color.getRGB(m.fogColor.value,Dd(n)),g.isFog?(m.fogNear.value=g.near,m.fogFar.value=g.far):g.isFogExp2&&(m.fogDensity.value=g.density)}function r(m,g,b,_,x){g.isNodeMaterial?g.uniformsNeedUpdate=!1:g.isMeshBasicMaterial?s(m,g):g.isMeshLambertMaterial?(s(m,g),g.envMap&&(m.envMapIntensity.value=g.envMapIntensity)):g.isMeshToonMaterial?(s(m,g),u(m,g)):g.isMeshPhongMaterial?(s(m,g),h(m,g),g.envMap&&(m.envMapIntensity.value=g.envMapIntensity)):g.isMeshStandardMaterial?(s(m,g),f(m,g),g.isMeshPhysicalMaterial&&d(m,g,x)):g.isMeshMatcapMaterial?(s(m,g),p(m,g)):g.isMeshDepthMaterial?s(m,g):g.isMeshDistanceMaterial?(s(m,g),y(m,g)):g.isMeshNormalMaterial?s(m,g):g.isLineBasicMaterial?(o(m,g),g.isLineDashedMaterial&&a(m,g)):g.isPointsMaterial?l(m,g,b,_):g.isSpriteMaterial?c(m,g):g.isShadowMaterial?(m.color.value.copy(g.color),m.opacity.value=g.opacity):g.isShaderMaterial&&(g.uniformsNeedUpdate=!1)}function s(m,g){m.opacity.value=g.opacity,g.color&&m.diffuse.value.copy(g.color),g.emissive&&m.emissive.value.copy(g.emissive).multiplyScalar(g.emissiveIntensity),g.map&&(m.map.value=g.map,t(g.map,m.mapTransform)),g.alphaMap&&(m.alphaMap.value=g.alphaMap,t(g.alphaMap,m.alphaMapTransform)),g.bumpMap&&(m.bumpMap.value=g.bumpMap,t(g.bumpMap,m.bumpMapTransform),m.bumpScale.value=g.bumpScale,g.side===gn&&(m.bumpScale.value*=-1)),g.normalMap&&(m.normalMap.value=g.normalMap,t(g.normalMap,m.normalMapTransform),m.normalScale.value.copy(g.normalScale),g.side===gn&&m.normalScale.value.negate()),g.displacementMap&&(m.displacementMap.value=g.displacementMap,t(g.displacementMap,m.displacementMapTransform),m.displacementScale.value=g.displacementScale,m.displacementBias.value=g.displacementBias),g.emissiveMap&&(m.emissiveMap.value=g.emissiveMap,t(g.emissiveMap,m.emissiveMapTransform)),g.specularMap&&(m.specularMap.value=g.specularMap,t(g.specularMap,m.specularMapTransform)),g.alphaTest>0&&(m.alphaTest.value=g.alphaTest);let b=e.get(g),_=b.envMap,x=b.envMapRotation;_&&(m.envMap.value=_,m.envMapRotation.value.setFromMatrix4(kw.makeRotationFromEuler(x)).transpose(),_.isCubeTexture&&_.isRenderTargetTexture===!1&&m.envMapRotation.value.premultiply(Xg),m.reflectivity.value=g.reflectivity,m.ior.value=g.ior,m.refractionRatio.value=g.refractionRatio),g.lightMap&&(m.lightMap.value=g.lightMap,m.lightMapIntensity.value=g.lightMapIntensity,t(g.lightMap,m.lightMapTransform)),g.aoMap&&(m.aoMap.value=g.aoMap,m.aoMapIntensity.value=g.aoMapIntensity,t(g.aoMap,m.aoMapTransform))}function o(m,g){m.diffuse.value.copy(g.color),m.opacity.value=g.opacity,g.map&&(m.map.value=g.map,t(g.map,m.mapTransform))}function a(m,g){m.dashSize.value=g.dashSize,m.totalSize.value=g.dashSize+g.gapSize,m.scale.value=g.scale}function l(m,g,b,_){m.diffuse.value.copy(g.color),m.opacity.value=g.opacity,m.size.value=g.size*b,m.scale.value=_*.5,g.map&&(m.map.value=g.map,t(g.map,m.uvTransform)),g.alphaMap&&(m.alphaMap.value=g.alphaMap,t(g.alphaMap,m.alphaMapTransform)),g.alphaTest>0&&(m.alphaTest.value=g.alphaTest)}function c(m,g){m.diffuse.value.copy(g.color),m.opacity.value=g.opacity,m.rotation.value=g.rotation,g.map&&(m.map.value=g.map,t(g.map,m.mapTransform)),g.alphaMap&&(m.alphaMap.value=g.alphaMap,t(g.alphaMap,m.alphaMapTransform)),g.alphaTest>0&&(m.alphaTest.value=g.alphaTest)}function h(m,g){m.specular.value.copy(g.specular),m.shininess.value=Math.max(g.shininess,1e-4)}function u(m,g){g.gradientMap&&(m.gradientMap.value=g.gradientMap)}function f(m,g){m.metalness.value=g.metalness,g.metalnessMap&&(m.metalnessMap.value=g.metalnessMap,t(g.metalnessMap,m.metalnessMapTransform)),m.roughness.value=g.roughness,g.roughnessMap&&(m.roughnessMap.value=g.roughnessMap,t(g.roughnessMap,m.roughnessMapTransform)),g.envMap&&(m.envMapIntensity.value=g.envMapIntensity)}function d(m,g,b){m.ior.value=g.ior,g.diffuseRoughness>0&&(m.diffuseRoughness.value=g.diffuseRoughness,g.diffuseRoughnessMap&&(m.diffuseRoughnessMap.value=g.diffuseRoughnessMap,t(g.diffuseRoughnessMap,m.diffuseRoughnessMapTransform))),g.sheen>0&&(m.sheenColor.value.copy(g.sheenColor).multiplyScalar(g.sheen),m.sheenRoughness.value=g.sheenRoughness,g.sheenColorMap&&(m.sheenColorMap.value=g.sheenColorMap,t(g.sheenColorMap,m.sheenColorMapTransform)),g.sheenRoughnessMap&&(m.sheenRoughnessMap.value=g.sheenRoughnessMap,t(g.sheenRoughnessMap,m.sheenRoughnessMapTransform))),g.clearcoat>0&&(m.clearcoat.value=g.clearcoat,m.clearcoatRoughness.value=g.clearcoatRoughness,g.clearcoatMap&&(m.clearcoatMap.value=g.clearcoatMap,t(g.clearcoatMap,m.clearcoatMapTransform)),g.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=g.clearcoatRoughnessMap,t(g.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),g.clearcoatNormalMap&&(m.clearcoatNormalMap.value=g.clearcoatNormalMap,t(g.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(g.clearcoatNormalScale),g.side===gn&&m.clearcoatNormalScale.value.negate())),g.dispersion>0&&(m.dispersion.value=g.dispersion),g.retroreflectivity>0&&(m.retroreflectivity.value=g.retroreflectivity),g.iridescence>0&&(m.iridescence.value=g.iridescence,m.iridescenceIOR.value=g.iridescenceIOR,m.iridescenceThicknessMinimum.value=g.iridescenceThicknessMinimum,m.iridescenceThicknessMaximum.value=g.iridescenceThicknessMaximum,g.iridescenceMap&&(m.iridescenceMap.value=g.iridescenceMap,t(g.iridescenceMap,m.iridescenceMapTransform)),g.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=g.iridescenceThicknessMap,t(g.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),g.transmission>0&&(m.transmission.value=g.transmission,m.transmissionSamplerMap.value=b.texture,m.transmissionSamplerSize.value.set(b.width,b.height),g.transmissionMap&&(m.transmissionMap.value=g.transmissionMap,t(g.transmissionMap,m.transmissionMapTransform)),m.thickness.value=g.thickness,g.thicknessMap&&(m.thicknessMap.value=g.thicknessMap,t(g.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=g.attenuationDistance,m.attenuationColor.value.copy(g.attenuationColor)),g.anisotropy>0&&(m.anisotropyVector.value.set(g.anisotropy*Math.cos(g.anisotropyRotation),g.anisotropy*Math.sin(g.anisotropyRotation)),g.anisotropyMap&&(m.anisotropyMap.value=g.anisotropyMap,t(g.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=g.specularIntensity,m.specularColor.value.copy(g.specularColor),g.specularColorMap&&(m.specularColorMap.value=g.specularColorMap,t(g.specularColorMap,m.specularColorMapTransform)),g.specularIntensityMap&&(m.specularIntensityMap.value=g.specularIntensityMap,t(g.specularIntensityMap,m.specularIntensityMapTransform))}function p(m,g){g.matcap&&(m.matcap.value=g.matcap)}function y(m,g){let b=e.get(g).light;m.referencePosition.value.setFromMatrixPosition(b.matrixWorld),m.nearDistance.value=b.shadow.camera.near,m.farDistance.value=b.shadow.camera.far}return{refreshFogUniforms:i,refreshMaterialUniforms:r}}function Ow(n,e,t,i){let r={},s={};function o(b,_){let x=_.program;i.uniformBlockBinding(b,x,r[b.id])}function a(b,_){let x=r[b.id];x===void 0&&(p(b),x=l(b),r[b.id]=x,b.addEventListener("dispose",m));let M=_.program;i.updateUBOMapping(b,M);let E=e.render.frame;s[b.id]!==E&&(c(b),s[b.id]=E)}function l(b){let _=n.createBuffer(),x=b.__size,M=b.usage;return n.bindBuffer(n.UNIFORM_BUFFER,_),n.bufferData(n.UNIFORM_BUFFER,x,M),n.bindBuffer(n.UNIFORM_BUFFER,null),_}function c(b){let _=r[b.id],x=b.uniforms,M=b.__cache;n.bindBuffer(n.UNIFORM_BUFFER,_);for(let E=0,v=x.length;E<v;E++){let A=x[E];if(Array.isArray(A))for(let L=0,C=A.length;L<C;L++)h(A[L],E,L,M);else h(A,E,0,M)}n.bindBuffer(n.UNIFORM_BUFFER,null)}function h(b,_,x,M){if(f(b,_,x,M)===!0){let E=b.__offset,v=b.value;if(Array.isArray(v)){let A=0;for(let L=0;L<v.length;L++){let C=v[L],k=y(C,!0);u(C,b.__data,A),A+=k.storage/Float32Array.BYTES_PER_ELEMENT}}else u(v,b.__data,0);n.bufferSubData(n.UNIFORM_BUFFER,E,b.__data)}}function u(b,_,x){typeof b=="number"||typeof b=="boolean"?_[x]=b:b.isMatrix3?(_[x]=b.elements[0],_[x+1]=b.elements[1],_[x+2]=b.elements[2],_[x+3]=0,_[x+4]=b.elements[3],_[x+5]=b.elements[4],_[x+6]=b.elements[5],_[x+7]=0,_[x+8]=b.elements[6],_[x+9]=b.elements[7],_[x+10]=b.elements[8],_[x+11]=0):ArrayBuffer.isView(b)?_.set(b.subarray(0,_.length-x),x):b.toArray(_,x)}function f(b,_,x,M){let E=b.value,v=_+"_"+x;if(Array.isArray(E)){M[v]===void 0&&(M[v]=[]);let A=M[v],L=!1;for(let C=0;C<E.length;C++)d(E[C],A,C)===!0&&(L=!0);return L}return d(E,M,v)}function d(b,_,x){if(_[x]===void 0)return typeof b=="number"||typeof b=="boolean"?_[x]=b:ArrayBuffer.isView(b)?_[x]=b.slice():_[x]=b.clone(),!0;{let M=_[x];if(typeof b=="number"||typeof b=="boolean"){if(M!==b)return _[x]=b,!0}else{if(ArrayBuffer.isView(b))return!0;if(M.equals(b)===!1)return M.copy(b),!0}}return!1}function p(b){let _=b.uniforms,x=0,M=16;for(let v=0,A=_.length;v<A;v++){let L=Array.isArray(_[v])?_[v]:[_[v]];for(let C=0,k=L.length;C<k;C++){let H=L[C],j=Array.isArray(H.value)?H.value:[H.value],I=Array.isArray(_[v])||Array.isArray(H.value),V=x;for(let W=0,te=j.length;W<te;W++){let X=j[W],ee=y(X,I),ne=x%M,be=ne%ee.boundary,ke=ne+be;x+=be,ke!==0&&M-ke<ee.storage&&(x+=M-ke),W===0&&(V=x),x+=ee.storage}let G=H.type==="int"?Int32Array:H.type==="uint"?Uint32Array:Float32Array;H.__data=new G((x-V)/Float32Array.BYTES_PER_ELEMENT),H.__offset=V}}let E=x%M;return E>0&&(x+=M-E),b.__size=x,b.__cache={},this}function y(b,_){let x={boundary:0,storage:0};return typeof b=="number"||typeof b=="boolean"?(x.boundary=4,x.storage=4):b.isVector2?(x.boundary=8,x.storage=8):b.isVector3||b.isColor?(x.boundary=16,x.storage=12):b.isVector4?(x.boundary=16,x.storage=16):b.isMatrix3?(x.boundary=16,x.storage=48):b.isMatrix4?(x.boundary=16,x.storage=64):b.isTexture?Ie("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(b)?(x.boundary=16,x.storage=b.byteLength):Ie("WebGLRenderer: Unsupported uniform value type.",b),_===!0&&(x.boundary=16,x.storage=Math.ceil(x.storage/16)*16),x}function m(b){let _=b.target;_.removeEventListener("dispose",m),n.deleteBuffer(r[_.id]),delete r[_.id],delete s[_.id]}function g(){for(let b in r)n.deleteBuffer(r[b]);r={},s={}}return{bind:o,update:a,dispose:g}}var Fw=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),bi=null;function Uw(){return bi===null&&(bi=new Rs(Fw,16,16,hr,ii),bi.name="DFG_LUT",bi.minFilter=pn,bi.magFilter=pn,bi.wrapS=mi,bi.wrapT=mi,bi.generateMipmaps=!1,bi.needsUpdate=!0),bi}var rh=class{constructor(e={}){let{canvas:t=lg(),context:i=null,depth:r=!0,stencil:s=!1,alpha:o=!1,antialias:a=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:u=!1,reversedDepthBuffer:f=!1,outputBufferType:d=kn}=e;this.isWebGLRenderer=!0;let p;if(i!==null){if(typeof WebGLRenderingContext<"u"&&i instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");p=i.getContextAttributes().alpha}else p=o;let y=d,m=new Set([Mc,Sc,_c]),g=new Set([kn,ni,zs,Wr,xc,vc]),b=new Uint32Array(4),_=new Int32Array(4),x={textures:[],min:[],max:[],resolution:[]},M=null,E=null,v=[],A=[],L=null;this.domElement=t,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=gi,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let C=this,k=!1,H=null,j=null,I=null,V=null;this._outputColorSpace=An;let G=0,W=0,te=null,X=-1,ee=null,ne=new at,be=new at,ke=null,J=new je(0),me=0,Me=t.width,Le=t.height,xe=1,He=null,At=null,Ne=new at(0,0,Me,Le),lt=new at(0,0,Me,Le),ut=!1,Je=new Ur,Zt=new Kl,Nt=!1,yn=!1,_t=new ft,ai=new O,Vt=new at,Fn={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},Un=!1;function Bn(){return te===null?xe:1}let F=i;function zn(w,D){return t.getContext(w,D)}let yt,bt,pe,Ot,De,Be,R,S,B,ie,Q,ae,de,Y,Z,ce,P,K,q,he,oe,le,Ae;try{let w={alpha:!0,depth:r,stencil:s,antialias:a,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:u};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${"187"}`),t.addEventListener("webglcontextlost",Ce,!1),t.addEventListener("webglcontextrestored",Ve,!1),t.addEventListener("webglcontextcreationerror",ge,!1),F===null){let D="webgl2";if(F=zn(D,w),F===null)throw zn(D)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}We()}catch(w){throw t.removeEventListener("webglcontextlost",Ce,!1),t.removeEventListener("webglcontextrestored",Ve,!1),t.removeEventListener("webglcontextcreationerror",ge,!1),Fe("WebGLRenderer: "+w.message),w}function We(){yt=new YS(F),yt.init(),oe=new Iw(F,yt),bt=new US(F,yt,e,oe),pe=new Cw(F,yt),bt.reversedDepthBuffer&&f&&pe.buffers.depth.setReversed(!0),j=F.createFramebuffer(),I=F.createFramebuffer(),V=F.createFramebuffer(),Ot=new KS(F),De=new mw,Be=new Pw(F,yt,pe,De,bt,oe,Ot),R=new qS(C),S=new ev(F),le=new OS(F,S),B=new JS(F,S,Ot,le),ie=new eM(F,B,S,le,Ot),K=new QS(F,bt,Be),Z=new BS(De),Q=new pw(C,R,yt,bt,le,Z),ae=new Nw(C,De),de=new yw,Y=new Mw(yt),P=new NS(C,R,pe,ie,p,l),ce=new Rw(C,ie,bt),Ae=new Ow(F,Ot,bt,pe),q=new FS(F,yt,Ot),he=new ZS(F,yt,Ot),Ot.programs=Q.programs,C.capabilities=bt,C.extensions=yt,C.properties=De,C.renderLists=de,C.shadowMap=ce,C.state=pe,C.info=Ot}y!==kn&&(L=new nM(y,t.width,t.height,a,r,s));let se=new jd(C,F);this.xr=se,this.getContext=function(){return F},this.getContextAttributes=function(){return F.getContextAttributes()},this.forceContextLoss=function(){let w=yt.get("WEBGL_lose_context");w&&w.loseContext()},this.forceContextRestore=function(){let w=yt.get("WEBGL_lose_context");w&&w.restoreContext()},this.getPixelRatio=function(){return xe},this.setPixelRatio=function(w){w!==void 0&&(xe=w,this.setSize(Me,Le,!1))},this.getSize=function(w){return w.set(Me,Le)},this.setSize=function(w,D,$=!0){if(se.isPresenting){Ie("WebGLRenderer: Can't change size while VR device is presenting.");return}Me=w,Le=D,t.width=Math.floor(w*xe),t.height=Math.floor(D*xe),$===!0&&(t.style.width=w+"px",t.style.height=D+"px"),L!==null&&L.setSize(t.width,t.height),this.setViewport(0,0,w,D)},this.getDrawingBufferSize=function(w){return w.set(Me*xe,Le*xe).floor()},this.setDrawingBufferSize=function(w,D,$){Me=w,Le=D,xe=$,t.width=Math.floor(w*$),t.height=Math.floor(D*$),this.setViewport(0,0,w,D)},this.setEffects=function(w){if(y===kn){Fe("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(w){for(let D=0;D<w.length;D++)if(w[D].isOutputPass===!0){Ie("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}L.setEffects(w||[])},this.getCurrentViewport=function(w){return w.copy(ne)},this.getViewport=function(w){return w.copy(Ne)},this.setViewport=function(w,D,$,U){w.isVector4?Ne.set(w.x,w.y,w.z,w.w):Ne.set(w,D,$,U),pe.viewport(ne.copy(Ne).multiplyScalar(Bn()).round())},this.getScissor=function(w){return w.copy(lt)},this.setScissor=function(w,D,$,U){w.isVector4?lt.set(w.x,w.y,w.z,w.w):lt.set(w,D,$,U),pe.scissor(be.copy(lt).multiplyScalar(Bn()).round())},this.getScissorTest=function(){return ut},this.setScissorTest=function(w){pe.setScissorTest(ut=w)},this.setOpaqueSort=function(w){He=w},this.setTransparentSort=function(w){At=w},this.getClearColor=function(w){return w.copy(P.getClearColor())},this.setClearColor=function(){P.setClearColor(...arguments)},this.getClearAlpha=function(){return P.getClearAlpha()},this.setClearAlpha=function(){P.setClearAlpha(...arguments)},this.clear=function(w=!0,D=!0,$=!0){let U=0;if(w){let z=!1;if(te!==null){let fe=te.texture.format;z=m.has(fe)}if(z){let fe=te.texture.type,Se=g.has(fe),ue=P.getClearColor(),ve=P.getClearAlpha(),Te=ue.r,ze=ue.g,Ze=ue.b;Se?(b[0]=Te,b[1]=ze,b[2]=Ze,b[3]=ve,F.clearBufferuiv(F.COLOR,0,b)):(_[0]=Te,_[1]=ze,_[2]=Ze,_[3]=ve,F.clearBufferiv(F.COLOR,0,_))}else U|=F.COLOR_BUFFER_BIT}D&&(U|=F.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),$&&(U|=F.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),U!==0&&F.clear(U)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(w){w.setRenderer(this),H=w},this.dispose=function(){t.removeEventListener("webglcontextlost",Ce,!1),t.removeEventListener("webglcontextrestored",Ve,!1),t.removeEventListener("webglcontextcreationerror",ge,!1),P.dispose(),de.dispose(),Y.dispose(),Be.dispose(),De.dispose(),R.dispose(),ie.dispose(),B.dispose(),le.dispose(),Ae.dispose(),Q.dispose(),se.dispose(),se.removeEventListener("sessionstart",_f),se.removeEventListener("sessionend",Sf),pr.stop()};function Ce(w){w.preventDefault(),Fo("WebGLRenderer: Context Lost."),k=!0}function Ve(){Fo("WebGLRenderer: Context Restored."),k=!1;let w=Ot.autoReset,D=ce.enabled,$=ce.autoUpdate,U=ce.needsUpdate,z=ce.type;We(),Ot.autoReset=w,ce.enabled=D,ce.autoUpdate=$,ce.needsUpdate=U,ce.type=z}function ge(w){Fe("WebGLRenderer: A WebGL context could not be created. Reason: ",w.statusMessage)}function ct(w){let D=w.target;D.removeEventListener("dispose",ct),Gt(D)}function Gt(w){Bi(w),De.remove(w)}function Bi(w){let D=De.get(w).programs;D!==void 0&&(D.forEach(function($){Q.releaseProgram($)}),w.isShaderMaterial&&Q.releaseShaderCache(w))}this.renderBufferDirect=function(w,D,$,U,z,fe){D===null&&(D=Fn);let Se=z.isMesh&&z.matrixWorld.determinantAffine()<0,ue=Zy(w,D,$,U,z);pe.setMaterial(U,Se);let ve=$.index,Te=1;if(U.wireframe===!0){if(ve=B.getWireframeAttribute($),ve===void 0)return;Te=2}let ze=$.drawRange,Ze=$.attributes.position,we=ze.start*Te,Ke=(ze.start+ze.count)*Te;fe!==null&&(we=Math.max(we,fe.start*Te),Ke=Math.min(Ke,(fe.start+fe.count)*Te)),ve!==null?(we=Math.max(we,0),Ke=Math.min(Ke,ve.count)):Ze!=null&&(we=Math.max(we,0),Ke=Math.min(Ke,Ze.count));let Rt=Ke-we;if(Rt<0||Rt===1/0)return;le.setup(z,U,ue,$,ve);let pt,dt=q;if(ve!==null&&(pt=S.get(ve),dt=he,dt.setIndex(pt)),z.isMesh)U.wireframe===!0?(pe.setLineWidth(U.wireframeLinewidth*Bn()),dt.setMode(F.LINES)):dt.setMode(F.TRIANGLES);else if(z.isLine){let nn=U.linewidth;nn===void 0&&(nn=1),pe.setLineWidth(nn*Bn()),z.isLineSegments?dt.setMode(F.LINES):z.isLineLoop?dt.setMode(F.LINE_LOOP):dt.setMode(F.LINE_STRIP)}else z.isPoints?dt.setMode(F.POINTS):z.isSprite&&dt.setMode(F.TRIANGLES);if(z.isBatchedMesh)if(yt.get("WEBGL_multi_draw"))dt.renderMultiDraw(z._multiDrawStarts,z._multiDrawCounts,z._multiDrawCount);else{let nn=z._multiDrawStarts,Ee=z._multiDrawCounts,un=z._multiDrawCount,nt=ve?S.get(ve).bytesPerElement:1,mr=De.get(U).currentProgram.getUniforms();for(let rn=0;rn<un;rn++)mr.setValue(F,"_gl_DrawID",rn),dt.render(nn[rn]/nt,Ee[rn])}else if(z.isInstancedMesh)dt.renderInstances(we,Rt,z.count);else if($.isInstancedBufferGeometry){let nn=$._maxInstanceCount!==void 0?$._maxInstanceCount:1/0,Ee=Math.min($.instanceCount,nn);dt.renderInstances(we,Rt,Ee)}else dt.render(we,Rt)};function vf(w,D,$,U){H!==null&&w.isNodeMaterial&&H.setObject(U,w),Nt===!0&&Z.setState(w,$,!1),w.transparent===!0&&w.side===Dn&&w.forceSinglePass===!1?(w.side=gn,w.needsUpdate=!0,Js(w,D,U),w.side=cr,w.needsUpdate=!0,Js(w,D,U),w.side=Dn):Js(w,D,U)}this.compile=function(w,D,$=null){$===null&&($=w),H!==null&&H.renderStart(w,D,$),E=Y.get($),E.init(D),A.push(E),$.traverseVisible(function(z){z.isLight&&z.layers.test(D.layers)&&(E.pushLight(z),z.castShadow&&E.pushShadow(z))}),w!==$&&w.traverseVisible(function(z){z.isLight&&z.layers.test(D.layers)&&(E.pushLight(z),z.castShadow&&E.pushShadow(z))}),E.setupLights(),H!==null&&H.updateLights(E.state.lightsArray),yn=this.localClippingEnabled,Nt=Z.init(this.clippingPlanes,yn),Nt===!0&&Z.setGlobalState(this.clippingPlanes,D),H!==null&&ce.render(E.state.shadowsArray,$,D);let U=new Set;return w.traverse(function(z){if(!(z.isMesh||z.isPoints||z.isLine||z.isSprite))return;let fe=z.material;if(fe)if(Array.isArray(fe))for(let Se=0;Se<fe.length;Se++){let ue=fe[Se];vf(ue,$,D,z),U.add(ue)}else vf(fe,$,D,z),U.add(fe)}),E=A.pop(),H!==null&&H.renderEnd(),U},this.compileAsync=function(w,D,$=null){let U=this.compile(w,D,$);return new Promise(z=>{function fe(){if(U.forEach(function(Se){let ve=De.get(Se).currentProgram;(ve===void 0||ve.isReady())&&U.delete(Se)}),U.size===0){z(w);return}setTimeout(fe,10)}yt.get("KHR_parallel_shader_compile")!==null?fe():setTimeout(fe,10)})};let Rh=null;function Yy(w){Rh&&Rh(w)}function _f(){pr.stop()}function Sf(){pr.start()}let pr=new Fg;pr.setAnimationLoop(Yy),typeof self<"u"&&pr.setContext(self),this.setAnimationLoop=function(w){Rh=w,se.setAnimationLoop(w),w===null?pr.stop():pr.start()},se.addEventListener("sessionstart",_f),se.addEventListener("sessionend",Sf),this.render=function(w,D){if(D!==void 0&&D.isCamera!==!0){Fe("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(k===!0)return;H!==null&&H.renderStart(w,D);let $=se.enabled===!0&&se.isPresenting===!0,U=L!==null&&(te===null||$)&&L.begin(C,te);if(w.matrixWorldAutoUpdate===!0&&w.updateMatrixWorld(),D.parent===null&&D.matrixWorldAutoUpdate===!0&&D.updateMatrixWorld(),se.enabled===!0&&se.isPresenting===!0&&(L===null||L.isCompositing()===!1)&&(se.cameraAutoUpdate===!0&&se.updateCamera(D),D=se.getCamera()),w.isScene===!0&&w.onBeforeRender(C,w,D,te),E=Y.get(w,A.length),E.init(D),E.state.textureUnits=Be.getTextureUnits(),A.push(E),_t.multiplyMatrices(D.projectionMatrix,D.matrixWorldInverse),D.isArrayCamera?Zt.setFromArrayCamera(D):Je.setFromProjectionMatrix(_t,$n,D.reversedDepth),yn=this.localClippingEnabled,Nt=Z.init(this.clippingPlanes,yn),M=de.get(w,v.length),M.init(),v.push(M),this.info.render.frame++,se.enabled===!0&&se.isPresenting===!0){let Se=C.xr.getDepthSensingMesh();Se!==null&&Ch(Se,D,-1/0,C.sortObjects)}Ch(w,D,0,C.sortObjects),M.finish(),H!==null&&H.updateLights(E.state.lightsArray),C.sortObjects===!0&&M.sort(He,At),Un=se.enabled===!1||se.isPresenting===!1||se.hasDepthSensing()===!1,Un&&P.addToRenderList(M,w),this.info.autoReset===!0&&this.info.reset(),Nt===!0&&Z.beginShadows();let z=E.state.shadowsArray;if(ce.render(z,w,D),Nt===!0&&Z.endShadows(),(U&&L.hasRenderPass())===!1){let Se=M.opaque,ue=M.transmissive;if(E.setupLights(),D.isArrayCamera){let ve=D.cameras;if(ue.length>0)for(let Te=0,ze=ve.length;Te<ze;Te++){let Ze=ve[Te];wf(Se,ue,w,Ze)}Un&&P.render(w);for(let Te=0,ze=ve.length;Te<ze;Te++){let Ze=ve[Te];Mf(M,w,Ze,Ze.viewport)}}else ue.length>0&&wf(Se,ue,w,D),Un&&P.render(w),Mf(M,w,D)}te!==null&&W===0&&(Be.updateMultisampleRenderTarget(te),Be.updateRenderTargetMipmap(te)),U&&L.end(C),w.isScene===!0&&w.onAfterRender(C,w,D),le.resetDefaultState(),X=-1,ee=null,A.pop(),A.length>0?(E=A[A.length-1],Be.setTextureUnits(E.state.textureUnits),Nt===!0&&Z.setGlobalState(C.clippingPlanes,E.state.camera)):E=null,v.pop(),v.length>0?M=v[v.length-1]:M=null,H!==null&&H.renderEnd()};function Ch(w,D,$,U){if(w.visible===!1)return;if(w.layers.test(D.layers)){if(w.isGroup)$=w.renderOrder;else if(w.isLOD)w.autoUpdate===!0&&w.update(D);else if(w.isLight)E.pushLight(w),w.castShadow&&E.pushShadow(w);else if(w.isSprite){let Se=D.isArrayCamera?Zt:Je;if(!w.frustumCulled||w.intersectsFrustum(Se)){U&&Vt.setFromMatrixPosition(w.matrixWorld).applyMatrix4(_t);let ue=ie.update(w),ve=w.material;ve.visible&&M.push(w,ue,ve,$,Vt.z,null,D)}}else if(w.isMesh||w.isLine||w.isPoints){let Se=D.isArrayCamera?Zt:Je;if(!w.frustumCulled||w.intersectsFrustum(Se)){let ue=ie.update(w),ve=w.material;if(U&&(w.boundingSphere!==void 0?(w.boundingSphere===null&&w.computeBoundingSphere(),Vt.copy(w.boundingSphere.center)):(ue.boundingSphere===null&&ue.computeBoundingSphere(),Vt.copy(ue.boundingSphere.center)),Vt.applyMatrix4(w.matrixWorld).applyMatrix4(_t)),Array.isArray(ve)){let Te=ue.groups;for(let ze=0,Ze=Te.length;ze<Ze;ze++){let we=Te[ze],Ke=ve[we.materialIndex];Ke&&Ke.visible&&M.push(w,ue,Ke,$,Vt.z,we,D)}}else ve.visible&&M.push(w,ue,ve,$,Vt.z,null,D)}}}let fe=w.children;for(let Se=0,ue=fe.length;Se<ue;Se++)Ch(fe[Se],D,$,U)}function Mf(w,D,$,U){let{opaque:z,transmissive:fe,transparent:Se}=w;E.setupLightsView($),Nt===!0&&Z.setGlobalState(C.clippingPlanes,$),U&&pe.viewport(ne.copy(U)),z.length>0&&xa(z,D,$),fe.length>0&&xa(fe,D,$),Se.length>0&&xa(Se,D,$),pe.buffers.depth.setTest(!0),pe.buffers.depth.setMask(!0),pe.buffers.color.setMask(!0),pe.setPolygonOffset(!1)}function wf(w,D,$,U){if(($.isScene===!0?$.overrideMaterial:null)!==null)return;if(E.state.transmissionRenderTarget[U.id]===void 0){let we=yt.has("EXT_color_buffer_half_float")||yt.has("EXT_color_buffer_float");E.state.transmissionRenderTarget[U.id]=new mn(1,1,{generateMipmaps:!0,type:we?ii:kn,minFilter:Oi,samples:Math.max(4,bt.samples),stencilBuffer:s,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:qe.workingColorSpace})}let fe=E.state.transmissionRenderTarget[U.id],Se=U.viewport||ne;fe.setSize(Se.z*C.transmissionResolutionScale,Se.w*C.transmissionResolutionScale);let ue=C.getRenderTarget(),ve=C.getActiveCubeFace(),Te=C.getActiveMipmapLevel();C.setRenderTarget(fe),C.getClearColor(J),me=C.getClearAlpha(),me<1&&C.setClearColor(16777215,.5),C.clear(),Un&&P.render($);let ze=C.toneMapping;C.toneMapping=gi;let Ze=U.viewport;if(U.viewport!==void 0&&(U.viewport=void 0),E.setupLightsView(U),Nt===!0&&Z.setGlobalState(C.clippingPlanes,U),xa(w,$,U),Be.updateMultisampleRenderTarget(fe),Be.updateRenderTargetMipmap(fe),yt.has("WEBGL_multisampled_render_to_texture")===!1){let we=!1;for(let Ke=0,Rt=D.length;Ke<Rt;Ke++){let pt=D[Ke],{object:dt,geometry:nn,material:Ee,group:un}=pt;if(Ee.side===Dn&&dt.layers.test(U.layers)){let nt=Ee.side;Ee.side=gn,Ee.needsUpdate=!0,Ef(dt,$,U,nn,Ee,un),Ee.side=nt,Ee.needsUpdate=!0,we=!0}}we===!0&&(Be.updateMultisampleRenderTarget(fe),Be.updateRenderTargetMipmap(fe))}C.setRenderTarget(ue,ve,Te),C.setClearColor(J,me),Ze!==void 0&&(U.viewport=Ze),C.toneMapping=ze}function xa(w,D,$){let U=D.isScene===!0?D.overrideMaterial:null;for(let z=0,fe=w.length;z<fe;z++){let Se=w[z],{object:ue,geometry:ve,group:Te}=Se,ze=Se.material;ze.allowOverride===!0&&U!==null&&(ze=U),ue.layers.test($.layers)&&Ef(ue,D,$,ve,ze,Te)}}function Ef(w,D,$,U,z,fe){H!==null&&z.isNodeMaterial&&H.setObject(w,z),w.onBeforeRender(C,D,$,U,z,fe),w.modelViewMatrix.multiplyMatrices($.matrixWorldInverse,w.matrixWorld),w.normalMatrix.getNormalMatrix(w.modelViewMatrix),z.onBeforeRender(C,D,$,U,w,fe),z.transparent===!0&&z.side===Dn&&z.forceSinglePass===!1?(z.side=gn,z.needsUpdate=!0,C.renderBufferDirect($,D,U,z,w,fe),z.side=cr,z.needsUpdate=!0,C.renderBufferDirect($,D,U,z,w,fe),z.side=Dn):C.renderBufferDirect($,D,U,z,w,fe),w.onAfterRender(C,D,$,U,z,fe)}function Tf(w){let D=0;for(let $ of w)$.texture!==null&&D++;return D}function Js(w,D,$){D.isScene!==!0&&(D=Fn);let U=De.get(w),z=E.state.lights,fe=E.state.shadowsArray,Se=z.state.version,ue=Q.getParameters(w,z.state,fe,D,$,E.state.lightProbeGridArray),ve=Q.getProgramCacheKey(ue),Te=U.programs;U.environment=w.isMeshStandardMaterial||w.isMeshLambertMaterial||w.isMeshPhongMaterial?D.environment:null,U.fog=D.fog;let ze=w.isMeshStandardMaterial||w.isMeshLambertMaterial&&!w.envMap||w.isMeshPhongMaterial&&!w.envMap;U.envMap=R.get(w.envMap||U.environment,ze),U.envMapRotation=U.environment!==null&&w.envMap===null?D.environmentRotation:w.envMapRotation,Te===void 0&&(w.addEventListener("dispose",ct),Te=new Map,U.programs=Te,U.programVariants=new Map);let Ze=Te.get(ve);if(Ze!==void 0){if(U.currentProgram===Ze&&U.lightsStateVersion===Se)return Rf(w,ue),Ze}else ue.uniforms=Q.getUniforms(w),H!==null&&w.isNodeMaterial&&H.build(w,$,ue),w.onBeforeCompile(ue,C),Ze=Q.acquireProgram(ue,ve),Te.set(ve,Ze),U.uniforms=ue.uniforms;let we=U.uniforms;return(!w.isShaderMaterial&&!w.isRawShaderMaterial||w.clipping===!0)&&(we.clippingPlanes=Z.uniform),Rf(w,ue),U.needsLights=Qy(w),U.lightsStateVersion=Se,U.needsLights&&(we.ambientLightColor.value=z.state.ambient,we.lightProbe.value=z.state.probe,we.sunLights.value=z.state.sun,we.sunLightShadows.value=z.state.sunShadow,we.directionalLights.value=z.state.directional,we.directionalLightShadows.value=z.state.directionalShadow,we.spotLights.value=z.state.spot,we.spotLightShadows.value=z.state.spotShadow,we.rectAreaLights.value=z.state.rectArea,we.ltc_1.value=z.state.rectAreaLTC1,we.ltc_2.value=z.state.rectAreaLTC2,we.pointLights.value=z.state.point,we.pointLightShadows.value=z.state.pointShadow,we.hemisphereLights.value=z.state.hemi,we.sunShadowMatrix.value=z.state.sunShadowMatrix,we.sunShadowCascade.value=z.state.sunShadowCascade,we.directionalShadowMatrix.value=z.state.directionalShadowMatrix,we.spotLightMatrix.value=z.state.spotLightMatrix,we.spotLightMap.value=z.state.spotLightMap,we.pointShadowMatrix.value=z.state.pointShadowMatrix),U.numLightProbeGrids=Tf(E.state.lightProbeGridArray),U.currentProgram=Ze,U.uniformsList=null,Ze}function Jy(w,D,$,U,z){let fe=De.get(w),Se=fe.currentProgram.id+","+U+","+z,ue=fe.programVariants.get(Se);return ue===void 0?(ue=Js(w,D,$),fe.programVariants.set(Se,ue)):(fe.currentProgram=ue,fe.uniformsList=null,fe.outputColorSpace=U,fe.toneMapping=z),ue}function Af(w){if(w.uniformsList===null){let D=w.currentProgram.getUniforms();w.uniformsList=Hs.seqWithValue(D.seq,w.uniforms)}return w.uniformsList}function Rf(w,D){let $=De.get(w);$.outputColorSpace=D.outputColorSpace,$.batching=D.batching,$.batchingColor=D.batchingColor,$.instancing=D.instancing,$.instancingColor=D.instancingColor,$.instancingMorph=D.instancingMorph,$.skinning=D.skinning,$.morphTargets=D.morphTargets,$.morphNormals=D.morphNormals,$.morphColors=D.morphColors,$.morphTargetsCount=D.morphTargetsCount,$.numClippingPlanes=D.numClippingPlanes,$.numIntersection=D.numClipIntersection,$.vertexAlphas=D.vertexAlphas,$.vertexTangents=D.vertexTangents,$.toneMapping=D.toneMapping}function Zy(w,D,$,U,z){D.isScene!==!0&&(D=Fn),Be.resetTextureUnits();let fe=D.fog,Se=U.isMeshStandardMaterial||U.isMeshLambertMaterial||U.isMeshPhongMaterial?D.environment:null,ue=te===null?C.outputColorSpace:te.isXRRenderTarget===!0?te.texture.colorSpace:qe.workingColorSpace,ve=U.isMeshStandardMaterial||U.isMeshLambertMaterial&&!U.envMap||U.isMeshPhongMaterial&&!U.envMap,Te=R.get(U.envMap||Se,ve),ze=U.vertexColors===!0&&!!$.attributes.color&&$.attributes.color.itemSize===4,Ze=!!$.attributes.tangent&&(!!U.normalMap||U.anisotropy>0),we=!!$.morphAttributes.position,Ke=!!$.morphAttributes.normal,Rt=!!$.morphAttributes.color,pt=gi;U.toneMapped&&(te===null||te.isXRRenderTarget===!0)&&(pt=C.toneMapping);let dt=$.morphAttributes.position||$.morphAttributes.normal||$.morphAttributes.color,nn=dt!==void 0?dt.length:0,Ee=De.get(U),un=E.state.lights;if(Nt===!0&&(yn===!0||w!==ee)){let St=w===ee&&U.id===X;Z.setState(U,w,St)}let nt=!1,mr=!1;U.version===Ee.__version?Ee.needsLights&&Ee.lightsStateVersion!==un.state.version||z.isBatchedMesh&&Ee.batching===!1||!z.isBatchedMesh&&Ee.batching===!0||z.isBatchedMesh&&Ee.batchingColor===!0&&z._colorsTexture===null||z.isBatchedMesh&&Ee.batchingColor===!1&&z._colorsTexture!==null||z.isInstancedMesh&&Ee.instancing===!1||!z.isInstancedMesh&&Ee.instancing===!0||z.isSkinnedMesh&&Ee.skinning===!1||!z.isSkinnedMesh&&Ee.skinning===!0||z.isInstancedMesh&&Ee.instancingColor===!0&&z.instanceColor===null||z.isInstancedMesh&&Ee.instancingColor===!1&&z.instanceColor!==null||z.isInstancedMesh&&Ee.instancingMorph===!0&&z.morphTexture===null||z.isInstancedMesh&&Ee.instancingMorph===!1&&z.morphTexture!==null||Ee.envMap!==Te||U.fog===!0&&Ee.fog!==fe||Ee.numClippingPlanes!==void 0&&(Ee.numClippingPlanes!==Z.numPlanes||Ee.numIntersection!==Z.numIntersection)||Ee.vertexAlphas!==ze||Ee.vertexTangents!==Ze||Ee.morphTargets!==we||Ee.morphNormals!==Ke||Ee.morphColors!==Rt||Ee.morphTargetsCount!==nn||Ee.numLightProbeGrids!==Tf(E.state.lightProbeGridArray)?nt=!0:(Ee.outputColorSpace!==ue||Ee.toneMapping!==pt)&&(mr=!0):(nt=!0,Ee.__version=U.version);let rn=Ee.currentProgram;(nt===!0||mr===!0)&&(rn=mr===!0?Jy(U,D,z,ue,pt):Js(U,D,z),H&&U.isNodeMaterial&&H.onUpdateProgram(U,rn,Ee));let va=!1,zi=!1,gr=!1,tt=rn.getUniforms(),Kt=Ee.uniforms;if(pe.useProgram(rn.program)&&(va=!0,zi=!0,gr=!0),U.id!==X&&(X=U.id,zi=!0),va||ee!==w){pe.buffers.depth.getReversed()&&w.reversedDepth!==!0&&(w._reversedDepth=!0,w.updateProjectionMatrix()),tt.setValue(F,"projectionMatrix",w.projectionMatrix),tt.setValue(F,"viewMatrix",w.matrixWorldInverse);let Wt=tt.map.cameraPosition;Wt!==void 0&&Wt.setValue(F,ai.setFromMatrixPosition(w.matrixWorld)),bt.logarithmicDepthBuffer&&tt.setValue(F,"logDepthBufFC",2/(Math.log(w.far+1)/Math.LN2)),(U.isMeshPhongMaterial||U.isMeshToonMaterial||U.isMeshLambertMaterial||U.isMeshBasicMaterial||U.isMeshStandardMaterial||U.isShaderMaterial)&&tt.setValue(F,"isOrthographic",w.isOrthographicCamera===!0),ee!==w&&(ee=w,zi=!0,gr=!0)}if(Ee.needsLights&&(un.state.sunShadowMap.length>0&&tt.setValue(F,"sunShadowMap",un.state.sunShadowMap,Be),un.state.directionalShadowMap.length>0&&tt.setValue(F,"directionalShadowMap",un.state.directionalShadowMap,Be),un.state.spotShadowMap.length>0&&tt.setValue(F,"spotShadowMap",un.state.spotShadowMap,Be),un.state.pointShadowMap.length>0&&tt.setValue(F,"pointShadowMap",un.state.pointShadowMap,Be)),z.isSkinnedMesh){tt.setOptional(F,z,"bindMatrix"),tt.setOptional(F,z,"bindMatrixInverse");let St=z.skeleton;St&&(St.boneTexture===null&&St.computeBoneTexture(),tt.setValue(F,"boneTexture",St.boneTexture,Be))}z.isBatchedMesh&&(tt.setOptional(F,z,"batchingTexture"),tt.setValue(F,"batchingTexture",z._matricesTexture,Be),tt.setOptional(F,z,"batchingIdTexture"),tt.setValue(F,"batchingIdTexture",z._indirectTexture,Be),tt.setOptional(F,z,"batchingColorTexture"),z._colorsTexture!==null&&tt.setValue(F,"batchingColorTexture",z._colorsTexture,Be));let Xn=$.morphAttributes;if((Xn.position!==void 0||Xn.normal!==void 0||Xn.color!==void 0)&&K.update(z,$,rn),(zi||Ee.receiveShadow!==z.receiveShadow)&&(Ee.receiveShadow=z.receiveShadow,tt.setValue(F,"receiveShadow",z.receiveShadow)),(U.isMeshStandardMaterial||U.isMeshLambertMaterial||U.isMeshPhongMaterial)&&U.envMap===null&&D.environment!==null&&(Kt.envMapIntensity.value=D.environmentIntensity),Kt.dfgLUT!==void 0&&(Kt.dfgLUT.value=Uw()),zi){if(tt.setValue(F,"toneMappingExposure",C.toneMappingExposure),Ee.needsLights&&Ky(Kt,gr),fe&&U.fog===!0&&ae.refreshFogUniforms(Kt,fe),ae.refreshMaterialUniforms(Kt,U,xe,Le,E.state.transmissionRenderTarget[w.id]),Ee.needsLights&&Ee.numLightProbeGrids>0){let St=x,Wt=0;for(let _i of E.state.lightProbeGridArray)_i.texture!==null&&(St.textures[Wt]=_i.texture,St.min[Wt]=_i.boundingBox.min,St.max[Wt]=_i.boundingBox.max,St.resolution[Wt]=_i.resolution,Wt++);for(let _i in St)St[_i].length=Wt;Kt.probesSH.value=St.textures,Kt.probesMin.value=St.min,Kt.probesMax.value=St.max,Kt.probesResolution.value=St.resolution}Hs.upload(F,Af(Ee),Kt,Be)}if(U.isShaderMaterial&&U.uniformsNeedUpdate===!0&&(Hs.upload(F,Af(Ee),Kt,Be),U.uniformsNeedUpdate=!1),U.isSpriteMaterial&&tt.setValue(F,"center",z.center),tt.setValue(F,"modelViewMatrix",z.modelViewMatrix),tt.setValue(F,"normalMatrix",z.normalMatrix),tt.setValue(F,"modelMatrix",z.matrixWorld),U.uniformsGroups!==void 0){let St=U.uniformsGroups;for(let Wt=0,_i=St.length;Wt<_i;Wt++){let Pf=St[Wt];Ae.update(Pf,rn),Ae.bind(Pf,rn)}}return rn}function Ky(w,D){w.ambientLightColor.needsUpdate=D,w.lightProbe.needsUpdate=D,w.sunLights.needsUpdate=D,w.sunLightShadows.needsUpdate=D,w.directionalLights.needsUpdate=D,w.directionalLightShadows.needsUpdate=D,w.pointLights.needsUpdate=D,w.pointLightShadows.needsUpdate=D,w.spotLights.needsUpdate=D,w.spotLightShadows.needsUpdate=D,w.rectAreaLights.needsUpdate=D,w.hemisphereLights.needsUpdate=D}function Qy(w){return w.isMeshLambertMaterial||w.isMeshToonMaterial||w.isMeshPhongMaterial||w.isMeshStandardMaterial||w.isShadowMaterial||w.isShaderMaterial&&w.lights===!0}this.getActiveCubeFace=function(){return G},this.getActiveMipmapLevel=function(){return W},this.getRenderTarget=function(){return te},this.setRenderTargetTextures=function(w,D,$){let U=De.get(w);U.__autoAllocateDepthBuffer=w.resolveDepthBuffer===!1,U.__autoAllocateDepthBuffer===!1&&(U.__useRenderToTexture=!1),De.get(w.texture).__webglTexture=D,De.get(w.depthTexture).__webglTexture=U.__autoAllocateDepthBuffer?void 0:$,U.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(w,D){let $=De.get(w);$.__webglFramebuffer=D,$.__useDefaultFramebuffer=D===void 0},this.setRenderTarget=function(w,D=0,$=0){te=w,G=D,W=$;let U=null,z=!1,fe=!1;if(w){let ue=De.get(w);if(ue.__useDefaultFramebuffer!==void 0){pe.bindFramebuffer(F.FRAMEBUFFER,ue.__webglFramebuffer),ne.copy(w.viewport),be.copy(w.scissor),ke=w.scissorTest,pe.viewport(ne),pe.scissor(be),pe.setScissorTest(ke),X=-1;return}else if(ue.__webglFramebuffer===void 0)Be.setupRenderTarget(w);else if(ue.__hasExternalTextures)Be.rebindTextures(w,De.get(w.texture).__webglTexture,De.get(w.depthTexture).__webglTexture);else if(w.depthBuffer){let ze=w.depthTexture;if(ue.__boundDepthTexture!==ze){if(ze!==null&&De.has(ze)&&(w.width!==ze.image.width||w.height!==ze.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");Be.setupDepthRenderbuffer(w)}}let ve=w.texture;(ve.isData3DTexture||ve.isDataArrayTexture||ve.isCompressedArrayTexture)&&(fe=!0);let Te=De.get(w).__webglFramebuffer;w.isWebGLCubeRenderTarget?(Array.isArray(Te[D])?U=Te[D][$]:U=Te[D],z=!0):w.samples>0&&Be.useMultisampledRTT(w)===!1?U=De.get(w).__webglMultisampledFramebuffer:Array.isArray(Te)?U=Te[$]:U=Te,ne.copy(w.viewport),be.copy(w.scissor),ke=w.scissorTest}else ne.copy(Ne).multiplyScalar(xe).floor(),be.copy(lt).multiplyScalar(xe).floor(),ke=ut;if($!==0&&(U=j),pe.bindFramebuffer(F.FRAMEBUFFER,U)&&pe.drawBuffers(w,U),pe.viewport(ne),pe.scissor(be),pe.setScissorTest(ke),z){let ue=De.get(w.texture);F.framebufferTexture2D(F.FRAMEBUFFER,F.COLOR_ATTACHMENT0,F.TEXTURE_CUBE_MAP_POSITIVE_X+D,ue.__webglTexture,$)}else if(fe){let ue=D;for(let ve=0;ve<w.textures.length;ve++){let Te=De.get(w.textures[ve]);F.framebufferTextureLayer(F.FRAMEBUFFER,F.COLOR_ATTACHMENT0+ve,Te.__webglTexture,$,ue)}}else if(w!==null&&$!==0){let ue=De.get(w.texture);F.framebufferTexture2D(F.FRAMEBUFFER,F.COLOR_ATTACHMENT0,F.TEXTURE_2D,ue.__webglTexture,$)}X=-1};function Cf(w){let D=De.get(w);return(D.__readFormat!==w.format||D.__readType!==w.type)&&(D.__readFormat=w.format,D.__readType=w.type,D.__formatReadable=bt.textureFormatReadable(w.format),D.__typeReadable=bt.textureTypeReadable(w.type)),D}this.readRenderTargetPixels=function(w,D,$,U,z,fe,Se,ue=0){if(!(w&&w.isWebGLRenderTarget)){Fe("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let ve=De.get(w).__webglFramebuffer;if(w.isWebGLCubeRenderTarget&&Se!==void 0&&(ve=ve[Se],Array.isArray(ve)&&(ve=ve[0])),ve){pe.bindFramebuffer(F.FRAMEBUFFER,ve);try{let Te=w.textures[ue],ze=Te.format,Ze=Te.type;w.textures.length>1&&F.readBuffer(F.COLOR_ATTACHMENT0+ue);let we=Cf(Te);if(we.__formatReadable===!1){Fe("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(we.__typeReadable===!1){Fe("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}D>=0&&D<=w.width-U&&$>=0&&$<=w.height-z&&F.readPixels(D,$,U,z,oe.convert(ze),oe.convert(Ze),fe)}finally{let Te=te!==null?De.get(te).__webglFramebuffer:null;pe.bindFramebuffer(F.FRAMEBUFFER,Te)}}},this.readRenderTargetPixelsAsync=async function(w,D,$,U,z,fe,Se,ue=0){if(!(w&&w.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let ve=De.get(w).__webglFramebuffer;if(w.isWebGLCubeRenderTarget&&Se!==void 0&&(ve=ve[Se],Array.isArray(ve)&&(ve=ve[0])),ve)if(D>=0&&D<=w.width-U&&$>=0&&$<=w.height-z){pe.bindFramebuffer(F.FRAMEBUFFER,ve);let Te=w.textures[ue],ze=Te.format,Ze=Te.type;w.textures.length>1&&F.readBuffer(F.COLOR_ATTACHMENT0+ue);let we=Cf(Te);if(we.__formatReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(we.__typeReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let Ke=F.createBuffer();F.bindBuffer(F.PIXEL_PACK_BUFFER,Ke),F.bufferData(F.PIXEL_PACK_BUFFER,fe.byteLength,F.STREAM_READ),F.readPixels(D,$,U,z,oe.convert(ze),oe.convert(Ze),0),F.bindBuffer(F.PIXEL_PACK_BUFFER,null);let Rt=te!==null?De.get(te).__webglFramebuffer:null;pe.bindFramebuffer(F.FRAMEBUFFER,Rt);let pt=F.fenceSync(F.SYNC_GPU_COMMANDS_COMPLETE,0);return F.flush(),await hg(F,pt,4),F.bindBuffer(F.PIXEL_PACK_BUFFER,Ke),F.getBufferSubData(F.PIXEL_PACK_BUFFER,0,fe),F.bindBuffer(F.PIXEL_PACK_BUFFER,null),F.deleteBuffer(Ke),F.deleteSync(pt),fe}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(w,D=null,$=0){let U=Math.pow(2,-$),z=Math.floor(w.image.width*U),fe=Math.floor(w.image.height*U),Se=D!==null?D.x:0,ue=D!==null?D.y:0;Be.setTexture2D(w,0),F.copyTexSubImage2D(F.TEXTURE_2D,$,0,0,Se,ue,z,fe),pe.unbindTexture()},this.copyTextureToTexture=function(w,D,$=null,U=null,z=0,fe=0){let Se,ue,ve,Te,ze,Ze,we,Ke,Rt,pt=w.isCompressedTexture?w.mipmaps[fe]:w.image;if($!==null)Se=$.max.x-$.min.x,ue=$.max.y-$.min.y,ve=$.isBox3?$.max.z-$.min.z:1,Te=$.min.x,ze=$.min.y,Ze=$.isBox3?$.min.z:0;else{let tt=Math.pow(2,-z);Se=Math.floor(pt.width*tt),ue=Math.floor(pt.height*tt),w.isDataArrayTexture?ve=pt.depth:w.isData3DTexture?ve=Math.floor(pt.depth*tt):ve=1,Te=0,ze=0,Ze=0}U!==null?(we=U.x,Ke=U.y,Rt=U.z):(we=0,Ke=0,Rt=0);let dt=oe.convert(D.format),nn=oe.convert(D.type),Ee;D.isData3DTexture?(Be.setTexture3D(D,0),Ee=F.TEXTURE_3D):D.isDataArrayTexture||D.isCompressedArrayTexture?(Be.setTexture2DArray(D,0),Ee=F.TEXTURE_2D_ARRAY):(Be.setTexture2D(D,0),Ee=F.TEXTURE_2D),pe.activeTexture(F.TEXTURE0),pe.pixelStorei(F.UNPACK_FLIP_Y_WEBGL,D.flipY),pe.pixelStorei(F.UNPACK_PREMULTIPLY_ALPHA_WEBGL,D.premultiplyAlpha),pe.pixelStorei(F.UNPACK_ALIGNMENT,D.unpackAlignment);let un=pe.getParameter(F.UNPACK_ROW_LENGTH),nt=pe.getParameter(F.UNPACK_IMAGE_HEIGHT),mr=pe.getParameter(F.UNPACK_SKIP_PIXELS),rn=pe.getParameter(F.UNPACK_SKIP_ROWS),va=pe.getParameter(F.UNPACK_SKIP_IMAGES);pe.pixelStorei(F.UNPACK_ROW_LENGTH,pt.width),pe.pixelStorei(F.UNPACK_IMAGE_HEIGHT,pt.height),pe.pixelStorei(F.UNPACK_SKIP_PIXELS,Te),pe.pixelStorei(F.UNPACK_SKIP_ROWS,ze),pe.pixelStorei(F.UNPACK_SKIP_IMAGES,Ze);let zi=w.isDataArrayTexture||w.isData3DTexture,gr=D.isDataArrayTexture||D.isData3DTexture;if(w.isDepthTexture){let tt=De.get(w),Kt=De.get(D),Xn=De.get(tt.__renderTarget),St=De.get(Kt.__renderTarget);pe.bindFramebuffer(F.READ_FRAMEBUFFER,Xn.__webglFramebuffer),pe.bindFramebuffer(F.DRAW_FRAMEBUFFER,St.__webglFramebuffer);for(let Wt=0;Wt<ve;Wt++)zi&&(F.framebufferTextureLayer(F.READ_FRAMEBUFFER,F.COLOR_ATTACHMENT0,De.get(w).__webglTexture,z,Ze+Wt),F.framebufferTextureLayer(F.DRAW_FRAMEBUFFER,F.COLOR_ATTACHMENT0,De.get(D).__webglTexture,fe,Rt+Wt)),F.blitFramebuffer(Te,ze,Te+Se,ze+ue,we,Ke,we+Se,Ke+ue,F.DEPTH_BUFFER_BIT,F.NEAREST);pe.bindFramebuffer(F.READ_FRAMEBUFFER,null),pe.bindFramebuffer(F.DRAW_FRAMEBUFFER,null)}else if(z!==0||w.isRenderTargetTexture||De.has(w)){let tt=De.get(w),Kt=De.get(D);pe.bindFramebuffer(F.READ_FRAMEBUFFER,I),pe.bindFramebuffer(F.DRAW_FRAMEBUFFER,V);for(let Xn=0;Xn<ve;Xn++)zi?F.framebufferTextureLayer(F.READ_FRAMEBUFFER,F.COLOR_ATTACHMENT0,tt.__webglTexture,z,Ze+Xn):F.framebufferTexture2D(F.READ_FRAMEBUFFER,F.COLOR_ATTACHMENT0,F.TEXTURE_2D,tt.__webglTexture,z),gr?F.framebufferTextureLayer(F.DRAW_FRAMEBUFFER,F.COLOR_ATTACHMENT0,Kt.__webglTexture,fe,Rt+Xn):F.framebufferTexture2D(F.DRAW_FRAMEBUFFER,F.COLOR_ATTACHMENT0,F.TEXTURE_2D,Kt.__webglTexture,fe),z!==0?F.blitFramebuffer(Te,ze,Te+Se,ze+ue,we,Ke,we+Se,Ke+ue,F.COLOR_BUFFER_BIT,F.NEAREST):gr?F.copyTexSubImage3D(Ee,fe,we,Ke,Rt+Xn,Te,ze,Se,ue):F.copyTexSubImage2D(Ee,fe,we,Ke,Te,ze,Se,ue);pe.bindFramebuffer(F.READ_FRAMEBUFFER,null),pe.bindFramebuffer(F.DRAW_FRAMEBUFFER,null)}else gr?w.isDataTexture||w.isData3DTexture?F.texSubImage3D(Ee,fe,we,Ke,Rt,Se,ue,ve,dt,nn,pt.data):D.isCompressedArrayTexture?F.compressedTexSubImage3D(Ee,fe,we,Ke,Rt,Se,ue,ve,dt,pt.data):F.texSubImage3D(Ee,fe,we,Ke,Rt,Se,ue,ve,dt,nn,pt):w.isDataTexture?F.texSubImage2D(F.TEXTURE_2D,fe,we,Ke,Se,ue,dt,nn,pt.data):w.isCompressedTexture?F.compressedTexSubImage2D(F.TEXTURE_2D,fe,we,Ke,pt.width,pt.height,dt,pt.data):F.texSubImage2D(F.TEXTURE_2D,fe,we,Ke,Se,ue,dt,nn,pt);pe.pixelStorei(F.UNPACK_ROW_LENGTH,un),pe.pixelStorei(F.UNPACK_IMAGE_HEIGHT,nt),pe.pixelStorei(F.UNPACK_SKIP_PIXELS,mr),pe.pixelStorei(F.UNPACK_SKIP_ROWS,rn),pe.pixelStorei(F.UNPACK_SKIP_IMAGES,va),fe===0&&D.generateMipmaps===!0&&D.mipmapsAutoUpdate===!0&&F.generateMipmap(Ee),pe.unbindTexture()},this.initRenderTarget=function(w){De.get(w).__webglFramebuffer===void 0&&Be.setupRenderTarget(w)},this.initTexture=function(w){w.isCubeTexture?Be.setTextureCube(w,0):w.isData3DTexture?Be.setTexture3D(w,0):w.isDataArrayTexture||w.isCompressedArrayTexture?Be.setTexture2DArray(w,0):Be.setTexture2D(w,0),pe.unbindTexture()},this.resetState=function(){G=0,W=0,te=null,pe.reset(),le.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return $n}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=qe._getDrawingBufferColorSpace(e),t.unpackColorSpace=qe._getUnpackColorSpace()}};var qg={type:"change"},qd={type:"start"},Jg={type:"end"},ah=new rr,Yg=new Rn,zw=Math.cos(70*Ld.DEG2RAD),Ht=new O,vn=2*Math.PI,rt={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},Xd=1e-6,lh=class extends qo{constructor(e,t=null){super(e,t),this.state=rt.NONE,this.target=new O,this.cursor=new O,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:jn.ROTATE,MIDDLE:jn.DOLLY,RIGHT:jn.PAN},this.touches={ONE:ti.ROTATE,TWO:ti.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._cursorStyle="auto",this._domElementKeyEvents=null,this._lastPosition=new O,this._lastQuaternion=new Cn,this._lastTargetPosition=new O,this._quat=new Cn().setFromUnitVectors(e.up,new O(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new Os,this._sphericalDelta=new Os,this._scale=1,this._panOffset=new O,this._rotateStart=new Pe,this._rotateEnd=new Pe,this._rotateDelta=new Pe,this._panStart=new Pe,this._panEnd=new Pe,this._panDelta=new Pe,this._dollyStart=new Pe,this._dollyEnd=new Pe,this._dollyDelta=new Pe,this._dollyDirection=new O,this._mouse=new Pe,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=Vw.bind(this),this._onPointerDown=Hw.bind(this),this._onPointerUp=Gw.bind(this),this._onContextMenu=Jw.bind(this),this._onMouseWheel=jw.bind(this),this._onKeyDown=Xw.bind(this),this._onTouchStart=qw.bind(this),this._onTouchMove=Yw.bind(this),this._onMouseDown=Ww.bind(this),this._onMouseMove=$w.bind(this),this._interceptControlDown=Zw.bind(this),this._interceptControlUp=Kw.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}set cursorStyle(e){this._cursorStyle=e,e==="grab"?this.domElement.style.cursor="grab":this.domElement.style.cursor="auto"}get cursorStyle(){return this._cursorStyle}connect(e){super.connect(e),this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointercancel",this._onPointerUp),this.domElement.addEventListener("contextmenu",this._onContextMenu),this.domElement.addEventListener("wheel",this._onMouseWheel,{passive:!1}),this.domElement.ownerDocument.addEventListener("keydown",this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction="none"}disconnect(){this.state=rt.NONE,this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.ownerDocument.removeEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.removeEventListener("pointerup",this._onPointerUp),this.domElement.removeEventListener("pointercancel",this._onPointerUp),this.domElement.removeEventListener("wheel",this._onMouseWheel),this.domElement.removeEventListener("contextmenu",this._onContextMenu),this.stopListenToKeyEvents(),this.domElement.ownerDocument.removeEventListener("keydown",this._interceptControlDown,{capture:!0}),this.domElement.ownerDocument.removeEventListener("keyup",this._interceptControlUp,{capture:!0}),this._controlActive=!1,this._pointers.length=0,this._pointerPositions={},this.domElement.style.touchAction="",this.domElement.style.cursor="auto"}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(e){e.addEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=e}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(qg),this.update(),this.state=rt.NONE}pan(e,t){this._pan(e,t),this.update()}dollyIn(e){this._dollyIn(e),this.update()}dollyOut(e){this._dollyOut(e),this.update()}rotateLeft(e){this._rotateLeft(e),this.update()}rotateUp(e){this._rotateUp(e),this.update()}update(e=null){let t=this.object.position;Ht.copy(t).sub(this.target),Ht.applyQuaternion(this._quat),this._spherical.setFromVector3(Ht),this.autoRotate&&this.state===rt.NONE&&this._rotateLeft(this._getAutoRotationAngle(e)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let i=this.minAzimuthAngle,r=this.maxAzimuthAngle;isFinite(i)&&isFinite(r)&&(i<-Math.PI?i+=vn:i>Math.PI&&(i-=vn),r<-Math.PI?r+=vn:r>Math.PI&&(r-=vn),i<=r?this._spherical.theta=Math.max(i,Math.min(r,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(i+r)/2?Math.max(i,this._spherical.theta):Math.min(r,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let s=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{let o=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),s=o!=this._spherical.radius}if(Ht.setFromSpherical(this._spherical),Ht.applyQuaternion(this._quatInverse),t.copy(this.target).add(Ht),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let o=null;if(this.object.isPerspectiveCamera){let a=Ht.length();o=this._clampDistance(a*this._scale);let l=a-o;this.object.position.addScaledVector(this._dollyDirection,l),this.object.updateMatrixWorld(),s=!!l}else if(this.object.isOrthographicCamera){let a=new O(this._mouse.x,this._mouse.y,0);a.unproject(this.object);let l=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),s=l!==this.object.zoom;let c=new O(this._mouse.x,this._mouse.y,0);c.unproject(this.object),this.object.position.sub(c).add(a),this.object.updateMatrixWorld(),o=Ht.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),this.zoomToCursor=!1;o!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(o).add(this.object.position):(ah.origin.copy(this.object.position),ah.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(ah.direction))<zw?this.object.lookAt(this.target):(Yg.setFromNormalAndCoplanarPoint(this.object.up,this.target),ah.intersectPlane(Yg,this.target))))}else if(this.object.isOrthographicCamera){let o=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),o!==this.object.zoom&&(this.object.updateProjectionMatrix(),s=!0)}return this._scale=1,this._performCursorZoom=!1,s||this._lastPosition.distanceToSquared(this.object.position)>Xd||8*(1-this._lastQuaternion.dot(this.object.quaternion))>Xd||this._lastTargetPosition.distanceToSquared(this.target)>Xd?(this.dispatchEvent(qg),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(e){return e!==null?vn/60*this.autoRotateSpeed*e:vn/60/60*this.autoRotateSpeed}_getZoomScale(e){let t=Math.abs(e*.01);return Math.pow(.95,this.zoomSpeed*t)}_rotateLeft(e){this._sphericalDelta.theta-=e}_rotateUp(e){this._sphericalDelta.phi-=e}_panLeft(e,t){Ht.setFromMatrixColumn(t,0),Ht.multiplyScalar(-e),this._panOffset.add(Ht)}_panUp(e,t){this.screenSpacePanning===!0?Ht.setFromMatrixColumn(t,1):(Ht.setFromMatrixColumn(t,0),Ht.crossVectors(this.object.up,Ht)),Ht.multiplyScalar(e),this._panOffset.add(Ht)}_pan(e,t){let i=this.domElement;if(this.object.isPerspectiveCamera){let r=this.object.position;Ht.copy(r).sub(this.target);let s=Ht.length();s*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*e*s/i.clientHeight,this.object.matrix),this._panUp(2*t*s/i.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(e*(this.object.right-this.object.left)/this.object.zoom/i.clientWidth,this.object.matrix),this._panUp(t*(this.object.top-this.object.bottom)/this.object.zoom/i.clientHeight,this.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),this.enablePan=!1)}_dollyOut(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=e:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_dollyIn(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=e:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_updateZoomParameters(e,t){if(!this.zoomToCursor)return;this._performCursorZoom=!0;let i=this.domElement.getBoundingClientRect(),r=e-i.left,s=t-i.top,o=i.width,a=i.height;this._mouse.x=r/o*2-1,this._mouse.y=-(s/a)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(e){return Math.max(this.minDistance,Math.min(this.maxDistance,e))}_handleMouseDownRotate(e){this._rotateStart.set(e.clientX,e.clientY)}_handleMouseDownDolly(e){this._updateZoomParameters(e.clientX,e.clientY),this._dollyStart.set(e.clientX,e.clientY)}_handleMouseDownPan(e){this._panStart.set(e.clientX,e.clientY)}_handleMouseMoveRotate(e){this._rotateEnd.set(e.clientX,e.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(vn*this._rotateDelta.x/t.clientHeight),this._rotateUp(vn*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(e){this._dollyEnd.set(e.clientX,e.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.zoomToCursor&&(this._performCursorZoom=!0,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()),this.update()}_handleMouseMovePan(e){this._panEnd.set(e.clientX,e.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(e){this._updateZoomParameters(e.clientX,e.clientY),e.deltaY<0?this._dollyIn(this._getZoomScale(e.deltaY)):e.deltaY>0&&this._dollyOut(this._getZoomScale(e.deltaY)),this.update()}_handleKeyDown(e){let t=!1;switch(e.code){case this.keys.UP:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(vn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),t=!0;break;case this.keys.BOTTOM:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(-vn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),t=!0;break;case this.keys.LEFT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(vn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),t=!0;break;case this.keys.RIGHT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(-vn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),t=!0;break}t&&(e.preventDefault(),this.update())}_handleTouchStartRotate(e){if(this._pointers.length===1)this._rotateStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),i=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateStart.set(i,r)}}_handleTouchStartPan(e){if(this._pointers.length===1)this._panStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),i=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panStart.set(i,r)}}_handleTouchStartDolly(e){let t=this._getSecondPointerPosition(e),i=e.pageX-t.x,r=e.pageY-t.y,s=Math.sqrt(i*i+r*r);this._dollyStart.set(0,s)}_handleTouchStartDollyPan(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enablePan&&this._handleTouchStartPan(e)}_handleTouchStartDollyRotate(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enableRotate&&this._handleTouchStartRotate(e)}_handleTouchMoveRotate(e){if(this._pointers.length==1)this._rotateEnd.set(e.pageX,e.pageY);else{let i=this._getSecondPointerPosition(e),r=.5*(e.pageX+i.x),s=.5*(e.pageY+i.y);this._rotateEnd.set(r,s)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(vn*this._rotateDelta.x/t.clientHeight),this._rotateUp(vn*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(e){if(this._pointers.length===1)this._panEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),i=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panEnd.set(i,r)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(e){let t=this._getSecondPointerPosition(e),i=e.pageX-t.x,r=e.pageY-t.y,s=Math.sqrt(i*i+r*r);this._dollyEnd.set(0,s),this._dollyDelta.set(0,Math.pow(this._dollyEnd.y/this._dollyStart.y,this.zoomSpeed)),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);let o=(e.pageX+t.x)*.5,a=(e.pageY+t.y)*.5;this._updateZoomParameters(o,a)}_handleTouchMoveDollyPan(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enablePan&&this._handleTouchMovePan(e)}_handleTouchMoveDollyRotate(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enableRotate&&this._handleTouchMoveRotate(e)}_addPointer(e){this._pointers.push(e.pointerId)}_removePointer(e){delete this._pointerPositions[e.pointerId];for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId){this._pointers.splice(t,1);return}}_isTrackingPointer(e){for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId)return!0;return!1}_trackPointer(e){let t=this._pointerPositions[e.pointerId];t===void 0&&(t=new Pe,this._pointerPositions[e.pointerId]=t),t.set(e.pageX,e.pageY)}_getSecondPointerPosition(e){let t=e.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[t]}_customWheelEvent(e){let t=e.deltaMode,i={clientX:e.clientX,clientY:e.clientY,deltaY:e.deltaY};switch(t){case 1:i.deltaY*=16;break;case 2:i.deltaY*=100;break}return e.ctrlKey&&!this._controlActive&&(i.deltaY*=10),i}};function Hw(n){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(n.pointerId),this.domElement.ownerDocument.addEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.addEventListener("pointerup",this._onPointerUp)),!this._isTrackingPointer(n)&&(this._addPointer(n),n.pointerType==="touch"?this._onTouchStart(n):this._onMouseDown(n),this._cursorStyle==="grab"&&(this.domElement.style.cursor="grabbing")))}function Vw(n){this.enabled!==!1&&(n.pointerType==="touch"?this._onTouchMove(n):this._onMouseMove(n))}function Gw(n){switch(this._removePointer(n),this._pointers.length){case 0:this.domElement.releasePointerCapture(n.pointerId),this.domElement.ownerDocument.removeEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.removeEventListener("pointerup",this._onPointerUp),this.dispatchEvent(Jg),this.state=rt.NONE,this._cursorStyle==="grab"&&(this.domElement.style.cursor="grab");break;case 1:let e=this._pointers[0],t=this._pointerPositions[e];this._onTouchStart({pointerId:e,pageX:t.x,pageY:t.y});break}}function Ww(n){let e;switch(n.button){case 0:e=this.mouseButtons.LEFT;break;case 1:e=this.mouseButtons.MIDDLE;break;case 2:e=this.mouseButtons.RIGHT;break;default:e=-1}switch(e){case jn.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(n),this.state=rt.DOLLY;break;case jn.ROTATE:if(n.ctrlKey||n.metaKey||n.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(n),this.state=rt.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(n),this.state=rt.ROTATE}break;case jn.PAN:if(n.ctrlKey||n.metaKey||n.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(n),this.state=rt.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(n),this.state=rt.PAN}break;default:this.state=rt.NONE}this.state!==rt.NONE&&this.dispatchEvent(qd)}function $w(n){switch(this.state){case rt.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(n);break;case rt.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(n);break;case rt.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(n);break}}function jw(n){this.enabled===!1||this.enableZoom===!1||this.state!==rt.NONE||(n.preventDefault(),this.dispatchEvent(qd),this._handleMouseWheel(this._customWheelEvent(n)),this.dispatchEvent(Jg))}function Xw(n){this.enabled!==!1&&this._handleKeyDown(n)}function qw(n){switch(this._trackPointer(n),this._pointers.length){case 1:switch(this.touches.ONE){case ti.ROTATE:if(this.enableRotate===!1){this.state=rt.NONE;break}this._handleTouchStartRotate(n),this.state=rt.TOUCH_ROTATE;break;case ti.PAN:if(this.enablePan===!1){this.state=rt.NONE;break}this._handleTouchStartPan(n),this.state=rt.TOUCH_PAN;break;default:this.state=rt.NONE}break;case 2:switch(this.touches.TWO){case ti.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(n),this.state=rt.TOUCH_DOLLY_PAN;break;case ti.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(n),this.state=rt.TOUCH_DOLLY_ROTATE;break;default:this.state=rt.NONE}break;default:this.state=rt.NONE}this.state!==rt.NONE&&this.dispatchEvent(qd)}function Yw(n){switch(this._trackPointer(n),this.state){case rt.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(n),this.update();break;case rt.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(n),this.update();break;case rt.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(n),this.update();break;case rt.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(n),this.update();break;default:this.state=rt.NONE}}function Jw(n){this.enabled!==!1&&n.preventDefault()}function Zw(n){n.key==="Control"&&(this._controlActive=!0,this.domElement.ownerDocument.addEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function Kw(n){n.key==="Control"&&(this._controlActive=!1,this.domElement.ownerDocument.removeEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}var Kd='"Helvetica Neue", Arial, sans-serif',Qg=13,ey=12,Zd=(n,e)=>{let[t,i,r]=wt(n).map(s=>Math.round(255*s));return`rgba(${t}, ${i}, ${r}, ${e})`};function ty(n,e,t,i,r,s,o,a){let l=r/2;switch(n.beginPath(),e){case"square":n.rect(t-l,i-l,r,r);break;case"diamond":n.moveTo(t,i-l),n.lineTo(t+l,i),n.lineTo(t,i+l),n.lineTo(t-l,i),n.closePath();break;case"triangle":n.moveTo(t,i-l),n.lineTo(t+.866*l,i+.5*l),n.lineTo(t-.866*l,i+.5*l),n.closePath();break;case"star":for(let c=0;c<10;c++){let h=-Math.PI/2+c*Math.PI/5,u=c%2===0?l:.4*l;c===0?n.moveTo(t+u*Math.cos(h),i+u*Math.sin(h)):n.lineTo(t+u*Math.cos(h),i+u*Math.sin(h))}n.closePath();break;case"cross":case"plus":{e==="cross"?(n.moveTo(t-l,i-l),n.lineTo(t+l,i+l),n.moveTo(t-l,i+l),n.lineTo(t+l,i-l)):(n.moveTo(t-l,i),n.lineTo(t+l,i),n.moveTo(t,i-l),n.lineTo(t,i+l)),n.lineWidth=Math.max(1,a||r/6),n.strokeStyle=s??"#ffffff",n.lineCap="butt",n.stroke();return}default:n.arc(t,i,l,0,2*Math.PI)}if(e==="ring"){n.lineWidth=Math.max(1,a||r/6),n.strokeStyle=s??"#ffffff",n.stroke();return}s!==null&&(n.fillStyle=s,n.fill()),o!==null&&a>0&&(n.lineWidth=a,n.strokeStyle=o,n.lineJoin="miter",n.stroke())}function Qd(n,e){let t=n.shape??"disc",i=typeof n.edge_width=="number"?n.edge_width:n.edge!==void 0?1:0;return t==="ring"||t==="cross"||t==="plus"?Math.max(1,i||e/6):n.edge!==void 0?i:0}function ny(n,e,t=4){let i=Qd(n,e),r=e+i,s=Math.max(8,Math.min(512,Math.ceil(r*t))),o=document.createElement("canvas");o.width=o.height=s;let a=o.getContext("2d"),l=s/r;return a.scale(l,l),ty(a,n.shape??"disc",r/2,r/2,e,n.color??"#ffffff",n.edge??null,i),o}var Gs=.984,hh=.227,Ws=Gs-hh,Qw=1.15,eE=2/14;function iy(n=1.2){return Qw+Ws*(n-1.2)}var ry=.7,sy=.18,tE=.42;function oy(n){let e=typeof n=="string"?[{text:n}]:n,t=[[]];for(let i of e)i.text.split(`
`).forEach((r,s)=>{s>0&&t.push([]),r!==""&&t[t.length-1].push({text:r,...i.shift?{shift:i.shift}:{}})});return t}var ef=(n,e)=>`${n.weight==="bold"?"bold ":""}${e?.shift?ry*n.size:n.size}px ${n.font}`;function ay(n,e,t){let i=0;for(let r of e)n.font=ef(t,r),i+=n.measureText(r.text).width;return i}var ch=n=>typeof n=="string"?n:n.map(e=>e.text).join("");function tf(n,e,t,i,r){let s=oy(e),o=Math.max(0,...s.map(u=>ay(n,u,r)));n.font=ef(r);let a=(Gs+iy(r.linespacing)*(s.length-1))*r.size,l=r.align==="center"?t-o/2:r.align==="end"?t-o:t,c=r.baseline,h=c==="middle"?i-a/2:c==="bottom"?i-a:c==="alphabetic"?i-a+hh*r.size:i;return[l,h,o,a]}function la(n,e,t,i,r){if(r.opacity<=0||ch(e)==="")return;let[s,o,a,l]=tf(n,e,t,i,r);n.save(),n.globalAlpha*=r.opacity;let c=r.box;if(c!==void 0){let h=c.pad??4,u=c.radius??0;n.beginPath(),nE(n,s-h,o-h,a+2*h,l+2*h,u),c.fill!==void 0&&(n.fillStyle=Zd(c.fill,c.opacity??1),n.fill()),c.edge!==void 0&&(c.edge_width??1)>0&&(n.lineWidth=c.edge_width??1,n.strokeStyle=Zd(c.edge,c.opacity??1),n.stroke())}n.fillStyle=r.color,n.textBaseline="alphabetic",n.textAlign="left",oy(e).forEach((h,u)=>{let f=ay(n,h,r),d=r.align==="center"?s+(a-f)/2:r.align==="end"?s+a-f:s,p=o+(Ws+iy(r.linespacing)*u)*r.size;for(let y of h){n.font=ef(r,y);let m=y.shift==="sub"?sy*r.size:y.shift==="sup"?-tE*r.size:0;n.fillText(y.text,d,p+m),d+=n.measureText(y.text).width}}),n.restore()}function nE(n,e,t,i,r,s){let o=Math.max(0,Math.min(s,i/2,r/2));n.moveTo(e+o,t),n.lineTo(e+i-o,t),n.arcTo(e+i,t,e+i,t+o,o),n.lineTo(e+i,t+r-o),n.arcTo(e+i,t+r,e+i-o,t+r,o),n.lineTo(e+o,t+r),n.arcTo(e,t+r,e,t+r-o,o),n.lineTo(e,t+o),n.arcTo(e,t,e+o,t,o),n.closePath()}function ly(n,e,t){let i=n.box===void 0?void 0:{...n.box,...n.box.fill?{fill:$t(n.box.fill,e)}:{},...n.box.edge?{edge:$t(n.box.edge,e)}:{}};return{size:n.size??Qg,color:n.color!==void 0?$t(n.color,e):e.foreground,weight:n.weight??"normal",font:e.font??Kd,align:n.align??"start",baseline:n.baseline??"middle",opacity:sn(n.opacity,t),box:i,...n.linespacing===void 0?{}:{linespacing:n.linespacing}}}function iE(n,e,t,i,r,s,o){let a=ly(e,s,o);if(a.opacity<=0||ch(t)==="")return;let[l,c]=e.offset??[0,0],h=i+l,u=r+c;if(e.leader!==void 0&&e.leader!==!1&&(l!==0||c!==0)){let[f,d,p,y]=tf(n,t,h,u,a),m=e.box!==void 0?e.box.pad??4:0,g=f+p/2,b=d+y/2,_=i-g,x=r-b,M=p/2+m,E=y/2+m,v=Math.min(Math.abs(_)>1e-9?M/Math.abs(_):1/0,Math.abs(x)>1e-9?E/Math.abs(x):1/0),A=eE*a.size;if(v<1){let L=g+v*_,C=b+v*x,k=Math.hypot(i-L,r-C);if(k>2*A){let H=(i-L)/k,j=(r-C)/k,I=e.leader===!0?{}:e.leader;n.save(),n.globalAlpha*=a.opacity,n.strokeStyle=I.color!==void 0?$t(I.color,s):a.color,n.lineWidth=I.width??1,n.beginPath(),n.moveTo(L+A*H,C+A*j),n.lineTo(i-A*H,r-A*j),n.stroke(),n.restore()}}}la(n,t,h,u,a)}var rE=[1,2,2.5,5,10];function Zg(n,e,t){let i=e-n;if(!(i>0)||!Number.isFinite(i))return{values:[],step:1};let r=i/Math.max(1,t),s=Math.pow(10,Math.floor(Math.log10(r))),o=[10,1,.1,.01].flatMap(f=>rE.map(d=>d*s*f)),a=o.filter(f=>f>=r*(1-1e-9)).sort((f,d)=>f-d),l=o.filter(f=>f<r*(1-1e-9)).sort((f,d)=>d-f),c=[...a,...l],h=[],u=c[0];for(let f of c){u=f,h=[];for(let d=Math.ceil(n/f-1e-9);d<=Math.floor(e/f+1e-9)&&h.length<200;d++)h.push(d*f+0);if(h.length>=2)break}return{values:h,step:u}}function Kg(n,e){let t=0;for(;t<10&&Math.abs(Math.round(e*10**t)-e*10**t)>1e-9*10**t;)t++;return(Math.abs(n)<e*1e-9?0:n).toFixed(t).replace("-","\u2212")}function sE(n,e,t){if(e.opacity<=0||e.rect.w<2||e.rect.h<2)return;let{x:i,y:r,w:s,h:o}=e.rect,a=t.font??Kd,l=t.foreground,c=3.5/14*e.size,h=3.5/14*e.size,u=4/14*e.size,f=.8/14*e.size;n.save(),n.globalAlpha*=e.opacity,n.strokeStyle=l,n.fillStyle=l,n.lineWidth=f,n.strokeRect(i,r,s,o),n.font=`${e.size}px ${a}`;let d=x=>i+(x-e.x0)/(e.x1-e.x0)*s,p=x=>r+o-(x-e.y0)/(e.y1-e.y0)*o,y=Zg(e.x0,e.x1,Math.max(1,Math.floor(s/(3*e.size)))),m=Zg(e.y0,e.y1,Math.max(1,Math.floor(o/(2*e.size))));n.beginPath();for(let x of y.values)n.moveTo(d(x),r+o),n.lineTo(d(x),r+o+c);for(let x of m.values)n.moveTo(i,p(x)),n.lineTo(i-c,p(x));n.stroke();let g=0;if(n.textBaseline="alphabetic",e.ticks.x){n.textAlign="center";for(let x of y.values)n.fillText(Kg(x,y.step),d(x),r+o+c+h+Ws*e.size)}if(e.ticks.y){n.textAlign="right";for(let x of m.values){let M=Kg(x,m.step);g=Math.max(g,n.measureText(M).width),n.fillText(M,i-c-h,p(x)+Ws/2*e.size)}}let b=16/14*e.size,_={size:b,color:l,weight:"normal",font:a,align:"center",baseline:"alphabetic",opacity:1};ch(e.titles[0])!==""&&la(n,e.titles[0],i+s/2,r+o+c+h+(e.ticks.x?Gs*e.size:0)+u+Ws*b,_),ch(e.titles[1])!==""&&(n.save(),n.translate(i-c-h-(e.ticks.y?g:0)-u,r+o/2),n.rotate(-Math.PI/2),la(n,e.titles[1],0,-hh*b,_),n.restore()),n.restore()}function oE(n,e,t,i,r,s){let o=sn(e.opacity,s);if(o<=0||e.entries.length===0)return;let a=e.size??Qg,l=r.font??Kd;n.save(),n.globalAlpha*=o,n.font=`${a}px ${l}`;let c=(e.handle_length??2)*a,h=(e.handle_pad??.8)*a,u=(e.column_spacing??2)*a,f=Math.max(1,Math.min(e.columns??e.entries.length,e.entries.length)),d=Math.ceil(e.entries.length/f),p=V=>c,y=e.entries.map((V,G)=>({e:V,col:Math.floor(G/d),row:G%d})),m=Array.from({length:f},()=>0),g={size:a,color:$t(e.color??r.foreground,r),weight:"normal",font:l,align:"start",baseline:"middle",opacity:1};for(let V of y)m[V.col]=Math.max(m[V.col],p(V.e)+h+tf(n,Jd(V.e.label),0,0,g)[2]);let b=m.reduce((V,G)=>V+G,0)+u*(f-1),_=(Gs+.5)*a,x=.4*a,M=.5*a,E=V=>Jd(V.label).some(G=>G.shift==="sub")?(sy+(ry-1)*hh)*a:0,v=y.map(({col:V,row:G})=>{let W=0;for(let te=0;te<G;te++)W+=_+E(e.entries[V*d+te]);return W}),A=Math.max(...y.map((V,G)=>v[G]+_+E(V.e)))-.5*a,L=e.at[0]*t,C=e.at[1]*i,k=e.align??"center",H=k==="center"?L-b/2:k==="end"?L-M-x-b:L+M+x,j=e.baseline??"top",I=j==="middle"?C-A/2:j==="bottom"?C-M-x-A:C+M+x;for(let[V,{e:G,col:W}]of y.entries()){let te=H+m.slice(0,W).reduce((be,ke)=>be+ke,0)+u*W,X=I+v[V]+Gs/2*a,ee=X+(Ws-Gs/2-.35)*a,ne=p(G);if(G.colors!==void 0){let be=G.colors.length,ke=ne/be;G.colors.forEach((J,me)=>{n.strokeStyle=$t(J,r),n.lineWidth=G.line?.width??2,n.globalAlpha=o*(G.line?.opacity??1),n.lineCap="butt",n.beginPath(),n.moveTo(te+me*ke,ee),n.lineTo(te+(me+1)*ke,ee),n.stroke()}),n.globalAlpha=o}else G.line!==void 0&&(n.save(),n.globalAlpha=o*(G.line.opacity??1),n.strokeStyle=$t(G.line.color??r.foreground,r),n.lineWidth=G.line.width??2,n.lineCap=G.line.dash===void 0?"square":"butt",G.line.dash!==void 0&&n.setLineDash(G.line.dash),n.beginPath(),n.moveTo(te,ee),n.lineTo(te+ne,ee),n.stroke(),n.restore());if(G.marker!==void 0){let be=so(G.marker,r);n.save(),n.globalAlpha=o*sn(be.opacity,s),ty(n,be.shape??"disc",te+ne/2,ee,no(be.size,s,.6*a),be.color??r.foreground,be.edge??null,typeof be.edge_width=="number"?be.edge_width:be.edge?1:0),n.restore()}la(n,Jd(G.label),te+ne+h,X,g)}n.restore()}function aE(n,e,t,i){t>=1||(n.save(),n.fillStyle=Zd(i.background,1-Math.max(0,t)),n.fillRect(e.x,e.y,e.w,e.h),n.restore())}function cy(n,e,t,i,r,s,o,a,l){let c=s*Ct(t.clock),h=null,u=f=>f.kind==="panel"?f.id:u(f.a);h=u(i.layout);for(let f of Object.keys(i.panels)){let d=e.paintInfo(f);if(d===null||d.outer.w<1||d.outer.h<1)continue;let p=sn(d.opacity,c);if(aE(n,d.outer,p,r),!(p<=0)){if(n.save(),n.globalAlpha=p,d.box!==null){let y=d.boxTitles,m=y===void 0?d.box.titles:[0,1].map(g=>{let b=y[g];if(b===void 0)return d.box.titles[g];let _=typeof b=="string"?[b]:b;return Yd(_,l(f,_))});sE(n,{...d.box,titles:m,opacity:sn(d.box.opacity,c)},r)}for(let y of d.labels){let m=d.rect;if(y.clip&&!(y.x>=m.x-.5&&y.x<=m.x+m.w+.5&&y.y>=m.y-.5&&y.y<=m.y+m.h+.5))continue;let g=typeof y.layer.text=="string"?[y.layer.text]:y.layer.text;iE(n,y.layer,Yd(g,l(f,g)),y.x,y.y,r,c)}n.restore()}}for(let f of t.overlays??[])if(f.kind==="legend")oE(n,f,o,a,r,c);else if(f.kind==="text"){let d=typeof f.text=="string"?[f.text]:f.text;la(n,h===null?"":Yd(d,l(h,d)),f.at[0]*o,f.at[1]*a,ly(f,r,c))}}function Yd(n,e){return e.map((t,i)=>{let r=n[i];return typeof r=="object"&&r!==null&&"sub"in r?{text:t,shift:"sub"}:typeof r=="object"&&r!==null&&"sup"in r?{text:t,shift:"sup"}:{text:t}})}function Jd(n){return typeof n=="string"?[{text:n}]:n.map(e=>typeof e=="string"?{text:e}:e.sub!==void 0?{text:e.sub,shift:"sub"}:{text:e.sup??"",shift:"sup"})}function lE(n,e){let[t,i,r,s]=n,o=[(t[0]+r[0])/2,(t[1]+r[1])/2],a=[(i[0]-t[0])/2,(i[1]-t[1])/2],l=[(s[0]-t[0])/2,(s[1]-t[1])/2];for(let c of[0,1]){let h=2*(Math.abs(a[c])+Math.abs(l[c]));h>=e||(h>0?(a[c]*=e/h,l[c]*=e/h):(Math.hypot(...a)<Math.hypot(...l)?a:l)[c]=e/2)}return[[o[0]-a[0]-l[0],o[1]-a[1]-l[1]],[o[0]+a[0]-l[0],o[1]+a[1]-l[1]],[o[0]+a[0]+l[0],o[1]+a[1]+l[1]],[o[0]-a[0]+l[0],o[1]-a[1]+l[1]]]}function cE(n,e,t,i,r,s){let o=0,a=1,l=e[0]-n[0],c=e[1]-n[1];for(let[h,u]of[[-l,n[0]-t],[l,i-n[0]],[-c,n[1]-r],[c,s-n[1]]])if(h===0){if(u<0)return null}else{let f=u/h;h<0?o=Math.max(o,f):a=Math.min(a,f)}return o<=a?[o,a]:null}function hE(n,e,t,i){let r=n.length,s=[],o=0,a=[];for(let d=0;d<r;d++){let p=n[d],y=n[(d+1)%r],m=Math.hypot(y[0]-p[0],y[1]-p[1]);s.push(o);let g=cE(p,y,-16,e+16,-16,t+16);if(g!==null&&m>0){let b=a[a.length-1],_=o+g[0]*m;b!==void 0&&_-b[1]<1e-9*Math.max(1,_)?b[1]=o+g[1]*m:a.push([_,o+g[1]*m])}o+=m}let l=o;if(!(l>0)||!Number.isFinite(l))return{closed:!1,paths:[]};if(a.length===1&&a[0][0]===0&&a[0][1]>=l*(1-1e-12)&&i===void 0)return{closed:!0,paths:[n.map(d=>[d[0],d[1]])]};let h=d=>{let p=r-1;for(;p>0&&s[p]>d;)p--;let y=n[p],m=n[(p+1)%r],g=(p+1<r?s[p+1]:l)-s[p],b=g>0?(d-s[p])/g:0;return[y[0]+b*(m[0]-y[0]),y[1]+b*(m[1]-y[1])]},u=(d,p)=>{let y=[h(d)];for(let m=1;m<r;m++)s[m]>d&&s[m]<p&&y.push(n[m]);return y.push(h(p)),y},f=[];for(let[d,p]of a){if(i===void 0){f.push(u(d,p));continue}let y=i[0]+i[1];for(let m=Math.floor(d/y);m*y<p;m++){let g=Math.max(d,m*y),b=Math.min(p,m*y+i[0]);b>g&&f.push(u(g,b))}}return{closed:!1,paths:f}}function uE(n,e,t,i=[]){let r=n.filter((h,u)=>u===0||Math.hypot(h[0]-n[u-1][0],h[1]-n[u-1][1])>1e-9);e&&r.length>1&&Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1])<=1e-9&&r.pop();let s=r.length;if(s<2)return i;let o=t/2,a=(h,u)=>{let f=Math.hypot(u[0]-h[0],u[1]-h[1]);return[-(u[1]-h[1])/f,(u[0]-h[0])/f]},l=[];for(let h=0;h<s;h++){let u=e||h>0?a(r[(h-1+s)%s],r[h]):null,f=e||h<s-1?a(r[h],r[(h+1)%s]):null;if(u===null||f===null){let g=u??f;l.push([g[0]*o,g[1]*o]);continue}let d=[u[0]+f[0],u[1]+f[1]],p=Math.hypot(d[0],d[1]),y=p>1e-9?[d[0]/p,d[1]/p]:f,m=o/Math.max(1/4,y[0]*f[0]+y[1]*f[1]);l.push([y[0]*m,y[1]*m])}let c=e?s:s-1;for(let h=0;h<c;h++){let u=(h+1)%s,[f,d,p,y]=[r[h],r[u],l[h],l[u]],m=[f[0]+p[0],f[1]+p[1]],g=[f[0]-p[0],f[1]-p[1]],b=[d[0]+y[0],d[1]+y[1]],_=[d[0]-y[0],d[1]-y[1]];i.push(...m,...g,...b,...g,..._,...b)}return i}function hy(n,e,t,i){let{closed:r,paths:s}=hE(lE(n,i.minSize),e,t,i.dash),o=[];for(let a of s)uE(a,r,i.width,o);return o}function uy(n){let e=new Map;for(let t of n){let i=JSON.stringify([t.label,t.gradient,t.lo,t.hi]),r=e.get(i);r===void 0?e.set(i,t):e.set(i,{...r,marker:r.marker??t.marker,band:r.band??t.band})}return[...e.values()]}function dh(n,e,t){let i={panels:new Map,gutters:[]},r=(s,o,a)=>{if(s.kind==="panel"){i.panels.set(s.id,o);return}let l=s.dir==="row",c=s.ratio<=0||s.ratio>=1?0:t,h=Math.max(0,(l?o.w:o.h)-c),u=Math.round(h*Math.min(1,Math.max(0,s.ratio))),f=h-u;l?(r(s.a,{x:o.x,y:o.y,w:u,h:o.h},`${a}a`),c>0&&i.gutters.push({path:a,dir:s.dir,rect:{x:o.x+u,y:o.y,w:c,h:o.h},outer:o}),r(s.b,{x:o.x+u+c,y:o.y,w:f,h:o.h},`${a}b`)):(r(s.a,{x:o.x,y:o.y,w:o.w,h:u},`${a}a`),c>0&&i.gutters.push({path:a,dir:s.dir,rect:{x:o.x,y:o.y+u,w:o.w,h:c},outer:o}),r(s.b,{x:o.x,y:o.y+u+c,w:o.w,h:f},`${a}b`))};return r(n,e,""),i}function uh(n,e,t){return n.kind==="panel"?n:e===""?{...n,ratio:t}:e[0]==="a"?{...n,a:uh(n.a,e.slice(1),t)}:{...n,b:uh(n.b,e.slice(1),t)}}function dy(n,e,t,i){let r=n.outer,s=n.dir==="row"?e-r.x-i/2:t-r.y-i/2,o=Math.max(1,(n.dir==="row"?r.w:r.h)-i);return Math.min(.9,Math.max(.1,s/o))}var bh=6,fy=9,dE=10,fE=.8,pE=8,mE=8,gE=.25,yE=.35,xh="vec4(2.0, 2.0, 2.0, 1.0)",Ey=`
attribute vec2 useg;
attribute float trajectory;
uniform highp sampler2D uRanges;
uniform highp sampler2D uAlphas;
uniform int uRangesWidth;
uniform int uKernel;
uniform float uRevolution;
uniform float uSkip;
uniform float uOpacity;
uniform float uFraction;
uniform float uTaperOpacity;
uniform float uFade;
ivec2 texelOf(float tr) {
  int t = int(tr + 0.5);
  return ivec2(t % uRangesWidth, t / uRangesWidth);
}
bool revealed(vec4 r) {
  bool lo = uRevolution > r.x || (uRevolution == r.x && r.y < useg.x);
  bool hi = uRevolution < r.z || (uRevolution == r.z && useg.y < r.w);
  return lo && hi && !(uSkip >= 0.0 && abs(trajectory - uSkip) < 0.5);
}
float along(vec4 r, float u) {
  if (uFraction <= 0.0) return 1.0;
  return clamp(1.0 - (r.z + r.w - (uRevolution + u)) / uFraction, 0.0, 1.0);
}
float alphaOf(float tr) {
  return uKernel == 1 ? texelFetch(uAlphas, texelOf(tr), 0).x : uOpacity;
}
`,Ty=`
uniform vec2 uResolution;
void trimSegment(const in vec4 start, inout vec4 end) {
  float nearEstimate = -0.5 * projectionMatrix[3][2] / projectionMatrix[2][2];
  float alpha = (nearEstimate - start.z) / (end.z - start.z);
  end.xyz = mix(start.xyz, end.xyz, alpha);
}
vec4 corner(vec3 a, vec3 b, float w) {
  vec4 va = modelViewMatrix * vec4(a, 1.0);
  vec4 vb = modelViewMatrix * vec4(b, 1.0);
  if (projectionMatrix[2][3] == -1.0) {
    if (va.z >= 0.0 && vb.z >= 0.0) return ${xh};
    if (va.z < 0.0 && vb.z >= 0.0) trimSegment(va, vb);
    else if (vb.z < 0.0 && va.z >= 0.0) trimSegment(vb, va);
  }
  vec4 ca = projectionMatrix * va;
  vec4 cb = projectionMatrix * vb;
  vec2 d = (cb.xy / cb.w - ca.xy / ca.w) * uResolution;
  float len = length(d);
  vec2 dir = len > 1e-9 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 c = position.y > 0.5 ? cb : ca;
  c.xy += nrm * position.x * w / uResolution * c.w;
  return c;
}
`,bE=Ey+`
#ifdef USE_TRAJECTORY_COLOR
attribute vec3 tcolor;
#endif
#ifdef DASH
attribute float dist;
uniform highp sampler2D uDashFrom;
uniform int uDashWidth;
uniform float uSegBase;
float restartAt(float j) {
  int i = int(j + uSegBase + 0.5);
  return texelFetch(uDashFrom, ivec2(i % uDashWidth, i / uDashWidth), 0).x;
}
varying float vDist;
#endif
uniform vec3 uColor;
varying vec4 vColor;
void main() {
  vec4 r = texelFetch(uRanges, texelOf(trajectory), 0);
  if (!revealed(r)) {
    vColor = vec4(0.0);
    gl_Position = ${xh};
    return;
  }
  float s = along(r, gl_VertexID % 2 == 1 ? useg.y : useg.x);
#ifdef USE_TRAJECTORY_COLOR
  vec3 rgb = tcolor;
#else
  vec3 rgb = uColor;
#endif
#ifdef DASH
  // the pattern starts again where the trajectory last entered the panel area
  vDist = dist - restartAt(float(gl_VertexID / 2));
#endif
  vColor = vec4(rgb, uFade * alphaOf(trajectory) * mix(uTaperOpacity, 1.0, s));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,xE=Ey+Ty+`
attribute vec3 instanceStart;
attribute vec3 instanceEnd;
#ifdef USE_TRAJECTORY_COLOR
attribute vec3 colorStart;
attribute vec3 colorEnd;
#endif
#ifdef DASH
attribute float distStart;
attribute float distEnd;
uniform highp sampler2D uDashFrom;
uniform int uDashWidth;
uniform float uSegBase;
float restartAt(float j) {
  int i = int(j + uSegBase + 0.5);
  return texelFetch(uDashFrom, ivec2(i % uDashWidth, i / uDashWidth), 0).x;
}
varying float vDist;
#endif
uniform vec3 uColor;
uniform float uWidth;
uniform float uTaperWidth;
varying vec4 vColor;
void main() {
  vec4 r = texelFetch(uRanges, texelOf(trajectory), 0);
  if (!revealed(r)) {
    vColor = vec4(0.0);
    gl_Position = ${xh};
    return;
  }
  bool atEnd = position.y > 0.5;
  float s = along(r, atEnd ? useg.y : useg.x);
#ifdef USE_TRAJECTORY_COLOR
  vec3 rgb = atEnd ? colorEnd : colorStart;
#else
  vec3 rgb = uColor;
#endif
#ifdef DASH
  vDist = (atEnd ? distEnd : distStart) - restartAt(float(gl_InstanceID));
#endif
  vColor = vec4(rgb, uFade * alphaOf(trajectory) * mix(uTaperOpacity, 1.0, s));
  gl_Position = corner(instanceStart, instanceEnd, uWidth * mix(uTaperWidth, 1.0, s));
}
`,vE=Ty+`
attribute vec3 instanceStart;
attribute vec3 instanceEnd;
attribute vec4 colorStart;
attribute vec4 colorEnd;
attribute float widthStart;
attribute float widthEnd;
#ifdef DASH
attribute float distStart;
attribute float distEnd;
varying float vDist;
#endif
varying vec4 vColor;
void main() {
  bool atEnd = position.y > 0.5;
  vColor = atEnd ? colorEnd : colorStart;
#ifdef DASH
  vDist = atEnd ? distEnd : distStart;
#endif
  gl_Position = corner(instanceStart, instanceEnd, atEnd ? widthEnd : widthStart);
}
`,py=`
uniform vec2 uResolution;
uniform vec4 uColor;
uniform float uWidth;
uniform float uHead;
uniform float uHeadWidth;
attribute vec3 instanceBase;
attribute vec3 instanceTip;
varying vec4 vColor;
void main() {
  vColor = uColor;
  vec4 ca = projectionMatrix * modelViewMatrix * vec4(instanceBase, 1.0);
  vec4 cb = projectionMatrix * modelViewMatrix * vec4(instanceTip, 1.0);
  vec2 half_ = 0.5 * uResolution;
  vec2 a = ca.xy / ca.w * half_;
  vec2 b = cb.xy / cb.w * half_;
  float len = length(b - a);
  if (ca.w <= 0.0 || cb.w <= 0.0 || len < 1e-3) {
    gl_Position = ${xh};
    return;
  }
  vec2 dir = (b - a) / len;
  vec2 nrm = vec2(-dir.y, dir.x);
  float head = min(uHead, len);
  vec2 neck = b - dir * head;
#ifdef HEAD
  vec2 p = position.y > 0.5 ? b : neck + nrm * position.x * 0.5 * uHeadWidth * head;
#else
  // the shaft runs half a pixel into the head, so that the two do not leave a seam
  vec2 p = (position.y > 0.5 ? neck + dir * min(0.5, head) : a) + nrm * position.x * 0.5 * uWidth;
#endif
  gl_Position = vec4(p / half_, 0.0, 1.0);
}
`,_E=`
uniform vec4 uColor;
varying vec4 vColor;
void main() {
  vColor = uColor;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,SE=`
varying vec4 vColor;
#ifdef DASH
varying float vDist;
uniform float uPixels;
uniform vec2 uDash;
#endif
void main() {
#ifdef DASH
  // a dash of uDash.x and a gap of uDash.y pixels along the screen, from the arclength in the display frame
  if (mod(vDist * uPixels, uDash.x + uDash.y) > uDash.x) discard;
#endif
  gl_FragColor = vColor;
}
`;function ME(){let n=document.createElement("canvas");n.width=n.height=64;let e=n.getContext("2d");e.fillStyle="#fff",e.beginPath(),e.arc(32,32,28,0,Math.PI*2),e.fill();let t=new Ls(n);return t.needsUpdate=!0,t}function fh(n,e=6){if(!(n>0)||!Number.isFinite(n))return 1;let t=n/e,i=Math.pow(10,Math.floor(Math.log10(t))),r=t/i;return(r<1.5?1:r<3.5?2:r<7.5?5:10)*i}function vi(n){let e=(a,l,c)=>new O(a,l,c);if(n.kind==="2d")return n.plane==="xz"?{right:e(1,0,0),up:e(0,0,1),normal:e(0,-1,0)}:n.plane==="yz"?{right:e(0,1,0),up:e(0,0,1),normal:e(1,0,0)}:{right:e(1,0,0),up:e(0,1,0),normal:e(0,0,1)};let[t,i,r]=n.up==="x"?[e(0,1,0),e(0,0,1),e(1,0,0)]:n.up==="y"?[e(0,0,1),e(1,0,0),e(0,1,0)]:[e(1,0,0),e(0,1,0),e(0,0,1)],s=t.clone().addScaledVector(i,-1.6).addScaledVector(r,.9).normalize();return{right:new O().crossVectors(r,s).normalize(),up:r,normal:s}}function $s(n){return n.kind==="3d"&&n.stretch!==void 0?new O(...n.stretch):new O(1,1,1)}function ff(){let n=new ks;return n.setAttribute("position",new Ut([-1,0,0,1,0,0,-1,1,0,1,1,0],3)),n.setIndex([0,1,2,2,1,3]),n}var fa=(n,e,t={})=>new Pn({vertexShader:n,fragmentShader:SE,uniforms:e,defines:t,transparent:!0,depthTest:!1,depthWrite:!1,side:Dn}),my=n=>Math.min(1,Math.max(0,n));function gy(n,e){n.stencilWrite=!0,n.stencilRef=e,n.stencilFunc=Md,n.stencilFail=Nr,n.stencilZFail=Nr,n.stencilZPass=Sd}var of=class{cache=new Map;get(e,t){let i=this.cache.get(e);return i===void 0&&(i=t(),this.cache.set(e,i)),i}};function wE(n,e){if(e===void 0||typeof e=="string"||oo(e)||typeof e.colormap=="string")return e;let t=e.colormap;ht(n.scene,t.input)?.kind!=="choice"&&T("panel",`the colormap is keyed on ${t.input}, which is not a choice`);let i=Wi(n,t.input),r=typeof i=="string"&&Object.hasOwn(t.map,i)?t.map[i]:void 0;return r===void 0&&T("panel",`the colormap keyed on ${t.input} does not name a colormap for ${JSON.stringify(i)}`),{...e,colormap:r}}function EE(n,e,t,i){let r=t.panels[i],s=n.panels[r.panel],o={scene:n,state:t,panel:r},a=xr(o,s),l=Pt(n.clock),c=Et(o,s.reference.sets),h=c===null?null:{set:e.sets.get(c),trajectory:0};h&&(h.trajectory=es(o,s.reference.member,h.set),l>1&&!h.set.periodic&&T("revolutions",`the reference trajectory's trajectory set ${h.set.id} is not periodic, and the clock has ${l} revolutions`));let u=[];return s.layers.forEach((f,d)=>{if(ts(o,f))if(f.kind==="trajectories"){let p=Et(o,f.sets),y=p===null?null:e.sets.get(p),m=y===null?[]:Qr(o,f.members,y),g=f.clock===void 0?n.clock:io(n.clock,f.clock),b=Tp(f,g)?f.clock===void 0?t.clock.channel:g.channels[0]:null,_=f.read_from??"own";_!=="own"&&_!=="reference"&&T("read-from",`a trajectories layer reads from ${JSON.stringify(_)}, not own or reference`),y!==null&&b!==null&&f.clock===void 0&&l>1&&!y.periodic&&T("revolutions",`a reading is taken on trajectory set ${y.id}, which is not periodic, and the clock has ${l} revolutions`);let x=f.highlight;x?.kernel!==void 0&&ht(n,x.input)?.kind!=="parameter"&&T("panel",`a highlight kernel needs a parameter input, and ${x.input} is not one`);let M=y!==null&&x!==void 0?Ra(o,{input:x.input},y):null,E=M!==null&&m.includes(M)?M:null;u.push({kind:"trajectories",index:d,layer:f,set:y,members:m,highlight:E,selected:M,channel:b,color:wE(o,f.color),readFrom:_,clock:g})}else if(f.kind==="arrow"){let p=Et(o,f.sets),y=f.clock===void 0?n.clock:io(n.clock,f.clock),m=f.clock===void 0?t.clock.channel:y.channels[0];u.push({kind:"arrow",index:d,layer:f,set:p===null?null:e.sets.get(p),channel:m,clock:y})}else if(f.kind==="inset_box")u.push({kind:"inset_box",index:d,layer:f});else if(f.kind==="body")u.push({kind:"body",index:d,layer:f});else if(f.kind==="points"){let p=Et(o,f.sets);u.push({kind:"points",index:d,layer:f,set:p===null?null:e.sets.get(p)})}else if(f.kind==="label"){let p=f.at,y=p!==null&&typeof p=="object"&&"sets"in p?Et(o,p.sets):null;u.push({kind:"label",index:d,layer:f,set:y===null?null:e.sets.get(y)})}else u.push({kind:f.kind,index:d,layer:f})}),{declaredId:r.panel,declared:s,display:a,scope:o,reference:h,layers:u}}function TE(n){return[n.declaredId,n.display,n.reference?.set.id??"",...n.layers.map(e=>e.kind==="trajectories"||e.kind==="points"?e.set?.id??"":"")].join("\0")}function af(n,e,t,i){let r=n.transform([0,0,0],e,t,i),s=new Float64Array(12);for(let o=0;o<3;o++){let a=n.transform([o===0?1:0,o===1?1:0,o===2?1:0],e,t,i);for(let l=0;l<3;l++)s[3*l+o]=a[l]-r[l]}return s.set(r,9),s}function AE(n,e,t,i=new ft,r){let{a:s,b:o,w:a}=ns(t,_r(n,t,r).at),l=af(n.frames,e,n.display,s),c=af(n.frames,e,n.display,o),h=l.map((u,f)=>(1-a)*u+a*c[f]);return i.set(h[0],h[1],h[2],h[9],h[3],h[4],h[5],h[10],h[6],h[7],h[8],h[11],0,0,0,1)}var RE=4e6;function CE(n,e,t,i,r){let s=i.frames,o=n.set.def.frame,a=i.geometry(n.set.id,o),l=e.set.periodic?Pt(i.scene.clock):1,c=s.requirements(o,t).channels.size>0,h=c?e.set.count(e.trajectory):1,u=n.members.length===n.set.trajectories?a.positions:Float64Array.from(n.members.flatMap(d=>[...a.trajectory(d,0)]));if(u.length>24&&u.length/3*h*(c?l:1)>r){let[d,p,y,m,g,b]=a.bounds();u=Float64Array.from([d,p,y,m,p,y,d,g,y,m,g,y,d,p,b,m,p,b,d,g,b,m,g,b])}let f=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let d=0;d<(c?l:1);d++)for(let p=0;p<h;p++){let y=af(s,o,t,{set:e.set,trajectory:e.trajectory,sample:p,shifted:!1,revolution:d});for(let m=0;m<u.length;m+=3){let g=u[m],b=u[m+1],_=u[m+2];for(let x=0;x<3;x++){let M=y[3*x]*g+y[3*x+1]*b+y[3*x+2]*_+y[9+x];M<f[x]&&(f[x]=M),M>f[x+3]&&(f[x+3]=M)}}}return f}function PE(n,e,t=RE){let i=null;for(let r of n.layers){if(r.kind!=="trajectories"||r.set===null||r.members.length===0||r.layer.fit===!1||r.readFrom==="reference"&&n.reference===null)continue;let s;if(r.readFrom==="reference")s=[CE(r,n.reference,n.display,e,t)];else{let o=e.geometry(r.set.id,n.display);s=r.members.length===r.set.trajectories?[o.bounds()]:r.members.map(a=>o.bounds(a))}for(let o of s)if(i===null)i=[...o];else for(let a=0;a<3;a++)i[a]=Math.min(i[a],o[a]),i[a+3]=Math.max(i[a+3],o[a+3])}return i}var ph=n=>n.kind==="2d"&&n.aspect==="free";function IE(n,e,t){let i=n.getCenter(new O),r=n.getSize(new O),s=Math.max(r.length()/2,1e-9),{right:o,up:a}=vi(e),l=y=>new O(Math.abs(y.x),Math.abs(y.y),Math.abs(y.z)),c=e.kind==="2d"?r.dot(l(o))/2:s,h=e.kind==="2d"?r.dot(l(a))/2:s,u=Math.max(h,c/t)*1.1,f=u>1e-12?u:Math.max(s,1);if(!ph(e))return{center:i,halfWidth:f*t,halfHeight:f};let d=y=>Math.max(Math.abs(n.min.dot(y)),Math.abs(n.max.dot(y))),p=(y,m)=>y>0&&y>1e-9*m;return{center:i,halfWidth:p(c,d(o))?c*1.1:f*t,halfHeight:p(h,d(a))?h*1.1:f}}function LE(n,e,t,i){let r=t>0?i/(e.width*t):0;return Math.max(n,e.opacity*Math.exp(-r*r))}function DE(n,e,t,i){let{right:r,up:s}=vi(e),o=n.position.dot(r),a=n.position.dot(s),l=(n.right-n.left)/(2*n.zoom),c=(n.top-n.bottom)/(2*n.zoom);return{x0:o-l,x1:o+l,y0:a-c,y1:a+c,w:t,h:i,stepX:fh(2*l,Math.max(3,t/110)),stepY:fh(2*c,Math.max(3,i/70))}}function mh(n,e,t){let i=[],r=Math.floor(e/t);for(let s=Math.ceil(n/t);s<=r&&i.length<1e3;s++)i.push(s*t);return i}function yy(n,e){let t=Math.max(0,-Math.floor(Math.log10(e)));return(Math.abs(n)<e*1e-9?0:n).toFixed(t).replace("-","\u2212")}var Ay=n=>7*n.length-3.5*(n.split(".").length-1);function lf(n){let e=n.kind==="title"?13:12,t=Ay(n.text)*e/12,i=n.align==="center"?-t/2:n.align==="end"?-t:0;return n.rotate?[n.x-e/2,n.y-i-t,n.x+e/2,n.y-i]:[n.x+i,n.y-e/2,n.x+i+t,n.y+e/2]}function kE(n,e){let[t,i,r,s]=lf(n),[o,a,l,c]=lf(e);return t<l&&o<r&&i<c&&a<s}var by=160,cf=9;function NE(n,e){let t=n.bars;return t===null||t.width<=0||t.height<=0?null:[e-t.right-t.width-2,t.top-2,e-t.right+2,t.top+t.height+2]}function xy(n,e){let[t,i,r,s]=lf(n),o=n.rotate?[cf-6,0]:[0,cf-6];return t-o[0]<e[2]&&e[0]<r+o[0]&&i-o[1]<e[3]&&e[1]<s+o[1]}function OE(n,e,t,i=0){let r=[],s=a=>(a-n.x0)/(n.x1-n.x0)*n.w,o=a=>n.h-(a-n.y0)/(n.y1-n.y0)*n.h;if(e){let a=[];for(let c of mh(n.y0,n.y1,n.stepY)){let h=o(c);h>Math.max(22,i+cf)&&h<n.h-44&&a.push({text:yy(c,n.stepY),x:0,y:h,align:"end",kind:"tick"})}let l=Math.max(44,22+Math.max(0,...a.map(c=>Ay(c.text))));for(let c of mh(n.x0,n.x1,n.stepX)){let h=s(c);h>l+12&&h<n.w-16&&r.push({text:yy(c,n.stepX),x:h,y:n.h-28,align:"center",kind:"tick"})}for(let c of a)r.push({...c,x:l})}return t!==null&&(t[0]!==""&&n.h>=by&&r.push({text:t[0],x:n.w/2,y:n.h-10,align:"center",kind:"title"}),t[1]!==""&&n.w>=by&&r.push({text:t[1],x:10,y:n.h/2,align:"center",rotate:!0,kind:"title"})),r}var hf=class{holder=new Yt;mat;spec;src;wide;obj=null;sharedNames=[];shown="";constructor(e,t,i){this.src=e,this.spec=t,this.wide=t.width>1;let r={...i,uRevolution:{value:t.revolution},uSkip:{value:-1},uSegBase:{value:0},uOpacity:{value:t.opacity},uWidth:{value:t.width},uKernel:{value:e.kernel&&!t.highlight?1:0}},s={};e.coloring.kind==="sample"&&(s.USE_TRAJECTORY_COLOR=""),e.dist!==null&&(s.DASH=""),this.mat=fa(this.wide?xE:bE,r,s)}show(e){this.mat.uniforms.uSegBase.value=typeof e=="number"?this.src.set.start(e)-e:0;let t=e===null?"":String(e);if(t===this.shown||(this.clear(),this.shown=t,e===null))return;let i=this.wide?this.quads(e):this.lines(e);this.obj=this.wide?new Jt(i,this.mat):new Ps(i,this.mat),this.obj.frustumCulled=!1,this.obj.renderOrder=this.holder.parent?.renderOrder??0,this.holder.add(this.obj)}arrays(e){let{ctx:t,set:i,geo:r,display:s,readings:o,coloring:a,colorKey:l,dist:c}=this.src,h=this.spec.revolution;if(e==="set")return{pos:t.shared.get(`pos\0${i.id}\0${s}\0${r.revolutionKey(h)}`,()=>Ip(r,h)),u:t.shared.get(`u\0${i.id}\0${o.channel}`,()=>kp(i,o.u)),tr:t.shared.get(`t\0${i.id}`,()=>Op(i)),col:a.kind==="sample"?t.shared.get(`c\0${i.id}\0${l}`,()=>xu(i,a.rgb,3)):null,dist:c===null?null:t.shared.get(`d\0${i.id}\0${s}\0${nf(c)}`,()=>xu(i,c,1))};let u=i.start(e),f=i.count(e);return{pos:Lp(r,e,h),u:Np(o.u,u,f),tr:new Float32Array(2*(f-1)).fill(e),col:a.kind==="sample"?vu(a.rgb,3,u,f):null,dist:c===null?null:vu(c,1,u,f)}}lines(e){let t=this.arrays(e),i=(s,o,a)=>e==="set"?this.src.ctx.shared.get(`gl\0${s}\0${this.src.set.id}\0${nf(o)}`,()=>new kt(o,a)):new kt(o,a),r=new vt;return r.setAttribute("position",i("position",t.pos,3)),r.setAttribute("useg",i("useg",t.u,2)),r.setAttribute("trajectory",i("trajectory",t.tr,1)),t.col&&r.setAttribute("tcolor",i("tcolor",t.col,3)),t.dist&&r.setAttribute("dist",i("dist",t.dist,1)),this.sharedNames=e==="set"?Object.keys(r.attributes):[],r}quads(e){let t=this.arrays(e),i=(o,a,l)=>e==="set"?this.src.ctx.shared.get(`gpu\0${o}\0${this.src.set.id}\0${nf(a)}`,()=>new lr(a,l)):new lr(a,l),r=ff(),s=i("pos",t.pos,6);if(r.setAttribute("instanceStart",new Tt(s,3,0)),r.setAttribute("instanceEnd",new Tt(s,3,3)),r.setAttribute("useg",new Tt(i("u",t.u,4),2,0)),r.setAttribute("trajectory",new Tt(i("t",t.tr,2),1,0)),t.col){let o=i("c",t.col,6);r.setAttribute("colorStart",new Tt(o,3,0)),r.setAttribute("colorEnd",new Tt(o,3,3))}if(t.dist){let o=i("d",t.dist,2);r.setAttribute("distStart",new Tt(o,1,0)),r.setAttribute("distEnd",new Tt(o,1,1))}return r.instanceCount=t.pos.length/6,this.sharedNames=e==="set"?Object.keys(r.attributes).filter(o=>o!=="position"):[],r}clear(){if(this.obj!==null){this.holder.remove(this.obj);for(let e of this.sharedNames)this.obj.geometry.deleteAttribute(e);this.obj.geometry.dispose(),this.obj=null,this.sharedNames=[]}}dispose(){this.clear(),this.mat.dispose()}},vy=new WeakMap,FE=0;function nf(n){let e=vy.get(n);return e===void 0&&(e=FE++,vy.set(n,e)),e}var ca=18,uf=class{mesh;buffer;mat;n=0;constructor(e,t,i=null){this.mat=fa(vE,{uResolution:t,...i??{}},i===null?{}:{DASH:""}),this.buffer=this.allocate(e),this.mesh=new Jt(this.geometry(),this.mat),this.mesh.frustumCulled=!1}allocate(e){let t=new lr(new Float32Array(ca*Math.max(1,e)),ca);return t.setUsage(yi),t}geometry(){let e=ff(),t=this.buffer;return e.setAttribute("instanceStart",new Tt(t,3,0)),e.setAttribute("instanceEnd",new Tt(t,3,3)),e.setAttribute("colorStart",new Tt(t,4,6)),e.setAttribute("colorEnd",new Tt(t,4,10)),e.setAttribute("widthStart",new Tt(t,1,14)),e.setAttribute("widthEnd",new Tt(t,1,15)),e.setAttribute("distStart",new Tt(t,1,16)),e.setAttribute("distEnd",new Tt(t,1,17)),e.instanceCount=0,e}begin(e){return ca*e>this.buffer.array.length&&(this.mesh.geometry.dispose(),this.buffer=this.allocate(2*e),this.mesh.geometry=this.geometry()),this.n=0,this.buffer.array}end(){this.mesh.geometry.instanceCount=this.n,this.mesh.visible=this.n>0,this.buffer.clearUpdateRanges(),this.buffer.addUpdateRange(0,ca*this.n),this.buffer.needsUpdate=!0}dispose(){this.mesh.geometry.dispose(),this.mat.dispose()}};function UE(n,e,t){let i=e.highlight?.kernel;if(i===void 0)return null;let r=ht(n.scene,e.highlight.input);if(r?.kind!=="parameter"||r.parameter===void 0)return null;let s=t.parameter(r.parameter,"panel"),o=1/0,a=-1/0;for(let l=0;l<s.length;l++)o=Math.min(o,s[l]),a=Math.max(a,s[l]);return{parameter:r.parameter,width:i.width,opacity:i.opacity,values:s,extent:a>=o?a-o:0}}function BE(n,e,t,i,r,s,o,a,l,c){let h=i>0?e[t]:0,u=!1;for(let f=0;f+1<i;f++){let d=n[2*(t+f)],p=n[2*(t+f)+1],y=n[2*(t+f+1)]-d,m=n[2*(t+f+1)+1]-p,g=0,b=1,_=!0;for(let[M,E]of[[-y,d-r],[y,o-d],[-m,p-s],[m,a-p]])if(M===0)E<0&&(_=!1);else{let v=E/M;M<0?g=Math.max(g,v):b=Math.min(b,v)}let x=_&&g<=b;if(x&&(g>0||!u)){let M=e[t+f];h=M+g*(e[t+f+1]-M)}l[c+f]=h,u=x&&b>=1}}function rf(n){let e=Math.min(Math.max(n,1),2048),t=Math.ceil(Math.max(n,1)/e),i=new Float32Array(4*e*t),r=new Rs(i,e,t,On,Nn);return r.minFilter=r.magFilter=xt,r.generateMipmaps=!1,r.needsUpdate=!0,{data:i,texture:r,width:e}}function _y(n,e,t=1,i=1){let r=new Float32Array(n.samples),s=[1,1,1];s[t]=i;for(let o=0;o<n.trajectories;o++){let a=n.start(o),l=0;r[a]=0;for(let c=1;c<n.count(o);c++){let h=3*(a+c-1),u=3*(a+c);l+=Math.hypot(s[0]*(e[u]-e[h]),s[1]*(e[u+1]-e[h+1]),s[2]*(e[u+2]-e[h+2])),r[a+c]=l}}return r}var pa=class{points;material;marker;tinted;texSize=0;texEdge=-1;edgeWidth;constructor(e,t,i){this.marker=e,this.edgeWidth=typeof e.edge_width=="number"?e.edge_width:void 0,this.tinted=i,this.material=new zr({size:t,sizeAttenuation:!1,vertexColors:i,transparent:!0,alphaTest:.01,depthTest:!1,depthWrite:!1}),this.points=new Is(new vt,this.material),this.points.frustumCulled=!1,this.grow(1),this.setSize(t)}setSize(e,t=this.edgeWidth){this.edgeWidth=t;let i={...this.marker,edge_width:t};this.material.size=e+Qd(i,e);let r=Math.max(1,e),s=t??0;if(Math.abs(r/Math.max(this.texSize,1e-9)-1)>.05||Math.abs(s-this.texEdge)>.05*Math.max(s,.5)){this.texSize=r,this.texEdge=s,this.material.map?.dispose();let o=new Ls(ny(this.tinted?{...i,color:void 0}:i,r));o.needsUpdate=!0,this.material.map=o,this.material.needsUpdate=!0}}setOpacity(e){this.material.opacity=e}grow(e){let t=this.points.geometry.getAttribute("position");if(t!==void 0&&t.count>=e)return;this.points.geometry.dispose();let i=new vt;i.setAttribute("position",new kt(new Float32Array(3*e),3).setUsage(yi)),i.setAttribute("color",new kt(new Float32Array(3*e),3).setUsage(yi)),this.points.geometry=i}get position(){return this.points.geometry.getAttribute("position")}get color(){return this.points.geometry.getAttribute("color")}show(e){this.position.needsUpdate=!0,this.color.needsUpdate=!0,this.points.geometry.setDrawRange(0,e),this.points.visible=e>0}dispose(){this.points.geometry.dispose(),this.material.map?.dispose(),this.material.dispose()}};function sf(n){let e=n.head;return typeof e=="object"&&e!==null?e:{}}var dr=class{key;group=new fn;src;layer;set;geo;clocks;clock;spec;color;width;hiWidth;opacity;hiOpacity;fraction;taperWidth;taperOpacity;kernel;ranges;alphas;dashFrom;dashScreen=new Float64Array(0);restartOut=[];resolution={value:new Pe(1,1)};uniforms;baseHolder=new Yt;hiHolder=new Yt;passes=new Map;pieces;heads=null;glow=null;headSize;headColor;fill=null;fillBuffer=new Float32Array(0);line;flatMark;keyframed;members=[];highlight=null;selected=null;baseWhat=null;skip=-1;filled=!1;referenceContext;geometry;constructor(e,t,i,r){this.key=r,this.geometry=e.geometry;let s=t.set,o=t.layer;this.set=s,this.layer=o,this.clock=t.clock,this.referenceContext=t.readFrom==="reference",this.referenceContext&&(this.group.matrixAutoUpdate=!1),this.geo=e.geometry.geometry(s.id,this.referenceContext?s.def.frame:i),this.clocks=t.channel===null?null:e.geometry.readings(s.id,t.channel);let a=this.clocks??e.geometry.readings(s.id,st);this.spec=Ap(o,s.periodic,Pt(t.clock)),this.color=t.color;let l=sp(np(t.color,e.theme),s,wt(e.theme.foreground));this.kernel=UE(e,o,s),this.line=o.line!==!1,this.flatMark=o.group_opacity===!0?t.index%255+1:0;let c=o.dash!==void 0&&this.line;this.src={ctx:e,set:s,geo:this.geo,display:this.geo.frame,readings:a,colorKey:JSON.stringify(t.color??null),coloring:l,kernel:this.kernel!==null,dist:c?e.shared.get(`dist\0${s.id}\0${this.geo.frame}`,()=>_y(s,this.geo.positions)):null},this.width=o.width??1,this.hiWidth=o.highlight?.width??this.width,this.opacity=typeof o.opacity=="number"?o.opacity:1,this.hiOpacity=o.highlight?.opacity??1,this.fraction=this.spec.reveal==="trail"?this.spec.revolutions*this.spec.fraction:0,this.taperWidth=o.trail?.taper?.width??gE,this.taperOpacity=o.trail?.taper?.opacity??yE;let h=so(sf(o),e.theme);this.keyframed=typeof o.opacity=="object"||typeof h.size=="object"||typeof h.opacity=="object"||typeof h.edge_width=="object",this.ranges=rf(s.trajectories);for(let f=0;f<s.trajectories;f++)this.ranges.data.set(yo,4*f);this.alphas=this.kernel===null?null:rf(s.trajectories);let u=c?{uPixels:{value:1},uDash:{value:new Pe(o.dash[0],o.dash[1])}}:null;if(this.dashFrom=c?rf(Math.max(1,s.samples-s.trajectories)):null,this.uniforms={uRanges:{value:this.ranges.texture},uAlphas:{value:(this.alphas??this.ranges).texture},uRangesWidth:{value:this.ranges.width},uColor:{value:new O(...l.kind==="constant"?l.rgb:[1,1,1])},uResolution:this.resolution,uFraction:{value:this.fraction},uTaperWidth:{value:this.taperWidth},uTaperOpacity:{value:this.fraction>0?this.taperOpacity:1},uFade:{value:1},...u??{},...this.dashFrom===null?{}:{uDashFrom:{value:this.dashFrom.texture},uDashWidth:{value:this.dashFrom.width}}},o.fill!==void 0){let f=o.fill,d=wt(f.color!==void 0?$t(f.color,e.theme):l.kind==="constant"?`#${new je(...l.rgb).getHexString()}`:e.theme.foreground),p=new As({color:new je(...d),transparent:!0,opacity:f.opacity??.25,depthTest:!1,depthWrite:!1,side:Dn});this.fill=new Jt(new vt,p),this.fill.frustumCulled=!1,this.group.add(this.fill)}if(this.group.add(this.baseHolder,this.hiHolder),this.pieces=new uf(2*Math.min(s.trajectories,64),this.resolution,u),this.flatMark>0&&gy(this.pieces.mesh.material,this.flatMark),this.group.add(this.pieces.mesh),this.headSize=typeof h.size=="number"?h.size:fy,this.headColor=h.color!==void 0?wt(h.color):null,$i(o)){if(h.glow!==void 0){let f=h.glow;this.glow=new pa({shape:"disc",color:f.color??"#d62728"},f.size??2.4*this.headSize,!1),this.glow.setOpacity(f.opacity??.35),this.group.add(this.glow.points)}this.heads=new pa(h,this.headSize,h.color===void 0),this.group.add(this.heads.points)}}resize(e,t){this.resolution.value.set(Math.max(1,e),Math.max(1,t))}dashRatio=1;setPixels(e,t){if(this.uniforms.uPixels===void 0||this.src.dist===null)return;this.uniforms.uPixels.value=e;let i=t/Math.max(e,1e-12);if(Math.abs(i/this.dashRatio-1)>.01){this.dashRatio=i,this.src.dist=_y(this.set,this.geo.positions,this.planeAxes[1],i);for(let r of this.passes.values())r.holder.removeFromParent(),r.dispose();this.passes.clear(),this.filled=!1}}colorAt(e,t,i,r){let s=this.src.coloring;if(s.kind==="constant"){i.set(s.rgb,r);return}let o=this.set.start(e);if("sample"in t){for(let a=0;a<3;a++)i[r+a]=s.rgb[3*(o+t.sample)+a];return}for(let a=0;a<3;a++)i[r+a]=(1-t.w)*s.rgb[3*(o+t.k)+a]+t.w*s.rgb[3*(o+t.k+1)+a]}distAt(e,t){let i=this.src.dist;if(i===null)return 0;let r=this.set.start(e),s="sample"in t?Math.min(t.sample,this.set.count(e)-2):t.k,o=this.dashFrom?.data[4*(r-e+Math.max(0,s))]??0;return"sample"in t?i[r+t.sample]-o:(1-t.w)*i[r+t.k]+t.w*i[r+t.k+1]-o}placeDash(e,t,i,r,s){let o=this.dashFrom,a=this.src.dist;if(o===null||a===null)return;e.updateMatrixWorld(),this.group.updateWorldMatrix(!0,!1);let c=new ft().multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse).multiply(this.group.matrixWorld).elements,h=this.geo.positions;this.dashScreen.length<2*this.set.samples&&(this.dashScreen=new Float64Array(2*this.set.samples));let u=this.dashScreen,f=!1;for(let d of this.members){let p=this.set.start(d),y=this.set.count(d);for(let g=p;g<p+y;g++){let b=h[3*g],_=h[3*g+1],x=h[3*g+2],M=c[3]*b+c[7]*_+c[11]*x+c[15],E=(c[0]*b+c[4]*_+c[8]*x+c[12])/M,v=(c[1]*b+c[5]*_+c[9]*x+c[13])/M;u[2*g]=t.x+(E+1)/2*t.w,u[2*g+1]=t.y+(1-v)/2*t.h}let m=p-d;BE(u,a,p,y,-s,-s,i+s,r+s,this.restartOut,0);for(let g=0;g+1<y;g++){let b=this.restartOut[g];o.data[4*(m+g)]!==b&&(o.data[4*(m+g)]=b,f=!0)}}f&&(o.texture.needsUpdate=!0)}fillKernel(){let e=this.kernel;if(e===null||this.alphas===null)return;let t=this.selected===null?null:e.values[this.selected];for(let i=0;i<this.set.trajectories;i++)this.alphas.data[4*i]=t===null?this.opacity:LE(this.opacity,e,e.extent,Math.abs(e.values[i]-t));this.alphas.texture.needsUpdate=!0}showPass(e){e.show(e.spec.highlight?this.highlight:this.baseWhat),e.mat.uniforms.uSkip.value=e.spec.highlight?-1:this.skip}pass(e,t){let i=`${t?"h":"b"}${e}`,r=this.passes.get(i);return r===void 0&&(r=new hf(this.src,{revolution:e,highlight:t,width:t?this.hiWidth:this.width,opacity:t?this.hiOpacity:this.opacity},this.uniforms),this.flatMark>0&&!t&&gy(r.mat,this.flatMark),(t?this.hiHolder:this.baseHolder).add(r.holder),this.passes.set(i,r),this.showPass(r)),r}syncPasses(e,t){for(let i of this.passes.values())i.holder.visible=!1;if(this.line){if(this.baseWhat!==null)for(let i=e[0];i<=e[1];i++)this.pass(i,!1).holder.visible=!0;if(this.highlight!==null)for(let i=t[0];i<=t[1];i++)this.pass(i,!0).holder.visible=!0}}get isStatic(){return this.clocks===null&&!this.referenceContext&&!this.keyframed}place(e,t){this.group.visible=t!==null,t!==null&&(AE(e,this.set.def.frame,t,this.group.matrix,this.geometry.readings(t.set.id,e.channel).clocks[t.trajectory]),this.group.matrixWorldNeedsUpdate=!0)}fade(e){let t=this.layer,i=typeof t.opacity=="object"?sn(t.opacity,e):1;this.uniforms.uFade.value=i;let r=sf(t);return this.heads?.setOpacity(i*sn(r.opacity,e)),this.heads!==null&&(typeof r.size=="object"||typeof r.edge_width=="object")&&this.heads.setSize(no(r.size,e,fy),r.edge_width===void 0?void 0:to(r.edge_width,e,0)),this.glow!==null&&this.glow.setOpacity(i*sn(r.opacity,e)*(r.glow?.opacity??.35)),this.fill!==null&&(this.fill.material.opacity=i*(t.fill?.opacity??.25)),i}update(e,t,i){let r=Hn(t.clock,i),s=this.fade(r),o=e.highlight;if(e.members.length!==this.members.length||e.members.some((_,x)=>_!==this.members[x])||o!==this.highlight||e.selected!==this.selected){let _=e.layer.members!=="all"&&e.members.length===1?e.members[0]:-1;this.members=e.members,this.highlight=o,this.selected=e.selected,this.baseWhat=_>=0?_===o?null:_:e.members.length>0?"set":null,this.skip=_<0&&o!==null?o:-1;for(let x of this.passes.values())this.showPass(x);for(let x=0;x<this.set.trajectories;x++)this.ranges.data.set(yo,4*x);this.fillKernel(),this.heads?.grow(e.members.length),this.glow?.grow(e.members.length),this.filled=!1}if(this.clocks===null&&this.filled)return!1;let l=this.pieces.begin(this.line?2*e.members.length:0),c=this.heads?.position,h=this.heads?.color,u=this.glow?.position,f=sf(this.layer).glow?.channel,d=f===void 0?null:this.set.channel(f,"panel"),p=0,y=0,m=[1/0,-1/0],g=[1/0,-1/0],b=[];for(let _ of e.members){let x=this.clocks?.clocks[_]??null,M=Rp(x,this.clock,i,this.spec,Math.fround);this.ranges.data.set(M.range,4*_);let E=_===o;if(M.revolutions!==null){let C=E?g:m;C[0]=Math.min(C[0],M.revolutions[0]),C[1]=Math.max(C[1],M.revolutions[1])}let v=E?this.hiWidth:this.width,A=s*(E?this.hiOpacity:this.alphas!==null?this.alphas.data[4*_]:this.opacity),L=this.fraction>0&&M.loop!==null;if(this.line)for(let C of M.pieces){let k=ca*this.pieces.n++;C.forEach((H,j)=>{this.geo.vertex(_,H,l,k+3*j),this.colorAt(_,H,l,k+6+4*j);let I=L?my(1-(M.loop-Dp(x,H))/this.fraction):1;l[k+9+4*j]=A*(L?this.taperOpacity+(1-this.taperOpacity)*I:1),l[k+14+j]=v>1&&L?v*(this.taperWidth+(1-this.taperWidth)*I):v,l[k+16+j]=this.distAt(_,H)})}if(c!==void 0&&h!==void 0&&M.head!==null&&p<c.count&&(this.geo.vertex(_,M.head,c.array,3*p),this.headColor!==null?h.array.set(this.headColor,3*p):this.colorAt(_,M.head,h.array,3*p),p++,u!==void 0&&d!==null)){let C=M.head,k="sample"in C?C.sample:C.w>=1?C.k+1:C.k;d[this.set.start(_)+k]>0&&this.geo.vertex(_,C,u.array,3*y++)}this.fill!==null&&!M.hidden&&this.fillTrajectory(_,x,M.loop,b)}return this.pieces.end(),this.heads?.show(p),this.glow?.show(y),this.fill!==null&&this.setFill(b),this.syncPasses(m,g),this.ranges.texture.needsUpdate=!0,this.filled=!0,!0}fillTrajectory(e,t,i,r){let s=this.spec,o=s.revolutions,a;t===null||i===null||s.reveal==="none"?a=Oh(this.set.count(e),o,s.periodic):s.reveal==="grow"?a=Ia(t,0,i,o):a=La(t,i,o,s.fraction,s.periodic);let l=this.planeAxes,c=this.layer.fill?.base??0,h=new Float32Array(3),u=null;for(let f of a){this.geo.vertex(e,f,h,0);let d=[h[l[0]],h[l[1]]];u!==null&&zE(u,d,c,r),u=d}}planeAxes=[0,1];setFill(e){let t=this.fill,i=e.length/2;3*i>this.fillBuffer.length&&(this.fillBuffer=new Float32Array(3*Math.max(2*i,96)),t.geometry.dispose(),t.geometry=new vt,t.geometry.setAttribute("position",new kt(this.fillBuffer,3).setUsage(yi)));let[r,s]=this.planeAxes;this.fillBuffer.fill(0,0,3*i);for(let a=0;a<i;a++)this.fillBuffer[3*a+r]=e[2*a],this.fillBuffer[3*a+s]=e[2*a+1];let o=t.geometry.getAttribute("position");o!==void 0&&(o.clearUpdateRanges(),o.addUpdateRange(0,3*i),o.needsUpdate=!0),t.geometry.setDrawRange(0,i),t.visible=i>0}extend(){}colorbar(){let e=this.color;if(e===void 0||typeof e=="string"||oo(e))return null;let t=$h(e,this.set),i=this.set.def.parameters??{},r=t.perTrajectory&&Object.hasOwn(i,t.name)?i[t.name]:void 0,s=r?.label??t.name,[o,a]=t.range,l=d=>a===o?.5:my((d-o)/(a-o)),c=this.highlight??(this.layer.members!=="all"&&this.members.length===1?this.members[0]:null),h=t.perTrajectory&&c!==null?l(t.values[c]):null,u=this.kernel,f=null;if(u!==null&&t.perTrajectory&&t.name===u.parameter&&this.selected!==null){let d=t.values[this.selected],p=1.5*u.width*u.extent;f=[l(d-p),l(d+p)]}return{label:r?.unit?`${s}, ${r.unit}`:s,gradient:op(t),stops:jh(t),lo:o,hi:a,marker:h,band:f}}dispose(){for(let e of this.passes.values())e.dispose();this.ranges.texture.dispose(),this.alphas?.texture.dispose(),this.pieces.dispose(),this.heads?.dispose(),this.glow?.dispose(),this.fill!==null&&(this.fill.geometry.dispose(),this.fill.material.dispose())}};function zE(n,e,t,i){let[r,s]=n,[o,a]=e,l=s>t,c=a>t;if(!l&&!c)return;let h=(f,d,p,y)=>i.push(f,t,f,d,p,y,f,t,p,y,p,t);if(l&&c){h(r,s,o,a);return}let u=r+(t-s)/(a-s)*(o-r);l?i.push(r,t,r,s,u,t):i.push(u,t,o,a,o,t)}var ha=class{key;group=new fn;sprites;layer;rgb;isStatic;done=!1;constructor(e,t,i){this.key=i,this.layer=t;let r=t.marker??{};this.rgb=wt(r.color!==void 0?$t(r.color,e.theme):e.theme.foreground),this.sprites=new pa(so(r,e.theme),typeof r.size=="number"?r.size:4,!1),this.group.add(this.sprites.points),this.isStatic=(t.reveal??"none")==="none"&&t.before===void 0&&t.after===void 0&&typeof r.size!="object"&&typeof r.edge_width!="object"&&typeof r.opacity!="object"&&typeof t.opacity!="object"}update(e,t){let i=Hn(e.base?.clock??e.clock,e.q),r=this.layer.marker??{};if(this.sprites.setOpacity(sn(this.layer.opacity,i)*sn(r.opacity,i)),(typeof r.size=="object"||typeof r.edge_width=="object")&&this.sprites.setSize(no(r.size,i,4),r.edge_width===void 0?void 0:to(r.edge_width,i,0)),this.isStatic&&this.done)return;let s=Oa(e,this.layer,t.set),o=0;for(let h of s.members)o+=h.points.length;this.sprites.grow(o);let a=this.sprites.position.array,l=this.sprites.color.array,c=0;for(let h of s.members)for(let u of h.points)a.set(u,3*c),l.set(this.rgb,3*c),c++;this.sprites.show(o),this.done=!0}extend(e){let t=this.sprites.position,i=this.sprites.points.geometry.drawRange;for(let r=0;r<Math.min(t.count,i.count);r++)e.expandByPoint(new O(t.getX(r),t.getY(r),t.getZ(r)))}dispose(){this.sprites.dispose()}},ua=class{key;group=new fn;layer;at=null;constructor(e,t){this.key=t,this.layer=e}update(e,t,i){let r=Na(e,this.layer,t.set,i);this.at=r.position===null?null:new O(...r.position)}extend(){}dispose(){}},Sy=new WeakMap;function HE(n,e){let t=Sy.get(n);t===void 0&&Sy.set(n,t=new Map);let i=t.get(e);return i===void 0&&(i=(async()=>{let r=n.bytes(e),s=r[0]===255?"image/jpeg":r[0]===82?"image/webp":"image/png",o=await createImageBitmap(new Blob([r],{type:s}),{imageOrientation:"flipY"}),a=new tn(o);return a.generateMipmaps=!1,a.minFilter=xt,a.magFilter=xt,a.flipY=!1,a.colorSpace=ri,a.needsUpdate=!0,a})(),t.set(e,i)),i}var fr=class{key;group=new fn;label;size;at=null;point;trail;geometry;scratch=new Float64Array(3);capacity=0;layer;ready;imageError=null;constructor(e,t,i,r=()=>{}){this.key=i,this.layer=t,this.geometry=e.geometry;let s=e.scene.bodies??{},o=Object.hasOwn(s,t.body)?s[t.body]:void 0;this.label=o?.label??null,this.size=t.size??pE;let a=new je(...wt(o?.color!==void 0?$t(o.color,e.theme):e.theme.foreground));this.ready=Promise.resolve();let l=new vt;l.setAttribute("position",new kt(new Float32Array(3),3).setUsage(yi)),this.point=new Is(l,new zr({color:a,size:this.size,sizeAttenuation:!1,map:e.disc,alphaTest:.5,transparent:!0,depthTest:!1,depthWrite:!1})),this.point.frustumCulled=!1;let c=o?.image;if(c!==void 0){let h=this.point.material;h.color.setRGB(1,1,1),h.alphaTest=.01,h.map=null,this.point.visible=!1,this.ready=HE(e.geometry,c).then(u=>{h.map=u,h.needsUpdate=!0,r()},u=>{let f=`body ${t.body} has image ${c}, which cannot be decoded as a PNG, JPEG, or WebP file`;this.imageError=u instanceof Qt?u:new Qt("timeline",f),r()})}this.trail=new Cs(new vt,new Br({color:a,transparent:!0,opacity:.6,depthTest:!1,depthWrite:!1})),this.trail.frustumCulled=!1,this.group.add(this.trail,this.point)}update(e,t,i){if(this.imageError!==null)throw this.imageError;let r=sn(this.layer.opacity,Hn(e.clock,e.q));if(this.point.material.opacity=r,this.trail.material.opacity=.6*r,i===null){this.point.visible=!1,this.trail.visible=!1,this.at=null;return}let{set:s,trajectory:o}=i,a=Pt(e.clock),l=this.geometry.readings(s.id,e.channel).clocks[o],c=this.geometry.bodyTrail(t.body,e.display,s.id,o),h=a*qn(l.reading(e.clock,e.q)),u=on(h,a),f=this.scratch;c.vertex(It(l,u.u,!1,u.revolution),f),this.point.visible=!this.hasImage||this.point.material.map!==null,this.at=new O(f[0],f[1],f[2]);let d=this.point.geometry.getAttribute("position");if(d.setXYZ(0,f[0],f[1],f[2]),d.needsUpdate=!0,t.trail===void 0){this.trail.visible=!1;return}let p=t.trail.fraction,y=h-a*p;y<0&&!s.periodic&&(y=0);let m=Fp(c.m,a,p);if(m>this.capacity){this.capacity=m,this.trail.geometry.dispose();let _=new vt;_.setAttribute("position",new kt(new Float32Array(3*this.capacity),3).setUsage(yi)),this.trail.geometry=_}let g=this.trail.geometry.getAttribute("position"),b=c.polyline(l,y,h,a,g.array);g.clearUpdateRanges(),g.addUpdateRange(0,3*b),g.needsUpdate=!0,this.trail.geometry.setDrawRange(0,b),this.trail.visible=b>1}extend(e){this.at!==null&&e.expandByPoint(this.at)}clip(e){if(!this.hasImage||this.at===null)return;let t=this.at.clone().project(e);(Math.abs(t.x)>1||Math.abs(t.y)>1)&&(this.point.visible=!1)}get hasImage(){let e=this.geometry.scene.bodies??{};return Object.hasOwn(e,this.layer.body)&&e[this.layer.body].image!==void 0}dispose(){this.point.material.map?.dispose();for(let e of[this.point,this.trail])e.geometry.dispose(),e.material.dispose()}},gh=class{key;group=new fn;geometry;resolution={value:new Pe(1,1)};shaft;head;buffer;constructor(e,t,i){this.key=i,this.geometry=e.geometry;let{layer:r}=t,s={uResolution:this.resolution,uColor:{value:new at(...wt($t(r.color??e.theme.foreground,e.theme)),typeof r.opacity=="number"?r.opacity:1)},uWidth:{value:r.width??1},uHead:{value:r.head?.size??dE},uHeadWidth:{value:fE}};this.buffer=this.allocate(t.set.trajectories);let o=new ks;o.setAttribute("position",new Ut([-1,0,0,1,0,0,0,1,0],3)),this.shaft=new Jt(this.attach(ff()),fa(py,s)),this.head=new Jt(this.attach(o),fa(py,s,{HEAD:""}));for(let a of[this.shaft,this.head])a.frustumCulled=!1;this.group.add(this.shaft,this.head)}allocate(e){return new lr(new Float32Array(6*Math.max(1,e)),6).setUsage(yi)}attach(e){return e.setAttribute("instanceBase",new Tt(this.buffer,3,0)),e.setAttribute("instanceTip",new Tt(this.buffer,3,3)),e.instanceCount=0,e}update(e,t){typeof t.layer.opacity=="object"&&(this.shaft.material.uniforms.uColor.value.w=sn(t.layer.opacity,Hn(e.clock,e.q)));let i=this.geometry.readings(t.set.id,t.channel).clocks,s=Da(e,t.layer,t.set,a=>i[a]).members.filter(a=>a.base!==null&&a.tip!==null);if(6*s.length>this.buffer.array.length){this.buffer=this.allocate(2*s.length);for(let a of[this.shaft,this.head])a.geometry.deleteAttribute("instanceBase"),a.geometry.deleteAttribute("instanceTip"),this.attach(a.geometry)}let o=this.buffer.array;s.forEach((a,l)=>{o.set(a.base,6*l),o.set(a.tip,6*l+3)}),this.buffer.clearUpdateRanges(),this.buffer.addUpdateRange(0,6*s.length),this.buffer.needsUpdate=!0;for(let a of[this.shaft,this.head])a.geometry.instanceCount=s.length,a.visible=s.length>0}resize(e,t){this.resolution.value.set(Math.max(1,e),Math.max(1,t))}extend(){}dispose(){for(let e of[this.shaft,this.head])e.geometry.dispose(),e.material.dispose()}};function VE(n,e,t,i,r,s,o){let{right:a,up:l}=vi(t),c=$s(r);i.updateMatrixWorld();let[h,u,f]=n.axes.map(p=>new O(...p)),d=[];for(let[p,y]of[[e.x0,e.y0],[e.x1,e.y0],[e.x1,e.y1],[e.x0,e.y1]]){let m=a.clone().multiplyScalar(p).addScaledVector(l,y),g=new O(...n.origin).addScaledVector(h,m.x).addScaledVector(u,m.y).addScaledVector(f,m.z);if(g.multiply(c).applyMatrix4(i.matrixWorldInverse),i instanceof cn&&g.z>=-i.near)return null;g.applyMatrix4(i.projectionMatrix),d.push([(g.x+1)/2*s,(1-g.y)/2*o])}return d}function GE(n){return n?.origin==null?null:n.shown_panel}var da=class{key;group=new fn;layer;mesh;positions=new Float32Array(0);map=null;constructor(e,t,i){this.key=i,this.layer=t;let r=new at(...wt($t(t.color??e.theme.foreground,e.theme)),typeof t.opacity=="number"?t.opacity:1);this.mesh=new Jt(new vt,fa(_E,{uColor:{value:r}})),this.mesh.frustumCulled=!1,this.mesh.visible=!1,this.group.add(this.mesh)}update(e,t){typeof this.layer.opacity=="object"&&(this.mesh.material.uniforms.uColor.value.w=sn(this.layer.opacity,Hn(e.clock,e.q))),this.map=ka(e,this.layer,t)}get target(){return GE(this.map)}place(e,t){let i=this.map,r=[],{w:s,h:o}=e.rect;if(i?.origin!=null&&i.axes!==null&&t?.view!=null&&t.error===null&&t.cameraSpec.kind==="2d"){let l=VE({...i,origin:i.origin,axes:i.axes},t.view,t.cameraSpec,e.camera,e.cameraSpec,s,o),c={width:this.layer.width??1,minSize:this.layer.min_size??mE,dash:this.layer.dash};l!==null&&(r=hy(l,s,o,c))}let a=r.length/2;3*a>this.positions.length&&(this.positions=new Float32Array(3*Math.max(2*a,96)),this.mesh.geometry.dispose(),this.mesh.geometry=new vt,this.mesh.geometry.setAttribute("position",new kt(this.positions,3).setUsage(yi)));for(let l=0;l<a;l++)this.positions[3*l]=2*r[2*l]/s-1,this.positions[3*l+1]=1-2*r[2*l+1]/o;if(a>0){let l=this.mesh.geometry.getAttribute("position");l.clearUpdateRanges(),l.addUpdateRange(0,3*a),l.needsUpdate=!0}this.mesh.geometry.setDrawRange(0,a),this.mesh.visible=a>0}extend(){}dispose(){this.mesh.geometry.dispose(),this.mesh.material.dispose()}},Ui=class{key;group=new fn;kind;follows;full;ticks;box;theme;lines;shown="";tips=[];constructor(e,t,i,r){this.key=r,this.kind=t.kind,this.theme=e.theme;let s=i.kind==="2d";this.box=t.kind==="axes"&&t.span==="box"&&s?t:null,t.kind==="axes"?(this.full=(t.span??(s?"full":"positive"))==="full",this.ticks=s&&this.full):(this.full=!1,this.ticks=s&&(t.labels??s)),this.follows=this.ticks||t.kind==="grid"&&ph(i);let o=new Br({vertexColors:!0,transparent:!0,depthTest:!1,depthWrite:!1});this.lines=new Ps(new vt,o),this.lines.frustumCulled=!1,this.group.add(this.lines)}set(e,t){this.lines.geometry.dispose();let i=new vt;i.setAttribute("position",new Ut(e,3)),i.setAttribute("color",new Ut(t,4)),this.lines.geometry=i}layout(e,t,i=new O(1,1,1)){if(this.follows||this.box!==null)return;let r=e.getCenter(new O),s=e.getSize(new O),o=Math.max(s.x,s.y,s.z,1e-9),a=[],l=[],c=(h,u,f,d)=>{a.push(h.x,h.y,h.z,u.x,u.y,u.z),l.push(...f,d,...f,d)};if(this.kind==="axes"){let h=s.clone().multiply(i),u=Math.max(h.x,h.y,h.z,1e-9),f=p=>fh(ph(t)&&p>1e-9*u?p:u,2),d=wt(this.theme.foreground);this.tips=[new O(f(h.x)/i.x,0,0),new O(0,f(h.y)/i.y,0),new O(0,0,f(h.z)/i.z)];for(let p of this.tips)c(this.full?p.clone().negate():new O,p,d,.8)}else{let{right:h,up:u,normal:f}=vi(t.kind==="2d"?t:{kind:"2d",plane:t.up==="x"?"yz":t.up==="y"?"xz":"xy"}),d=fh(o,8),p=wt(this.theme.grid),y=wt(_n(this.theme.grid,this.theme.foreground,.3)),m=r.dot(h),g=r.dot(u),b=Math.abs(f.x)>.5?"x":Math.abs(f.y)>.5?"y":"z",_=new O;_[b]=1;let x=e.min[b]<=0&&e.max[b]>=0?0:r[b],M=2.5*o,E=Math.floor((m-M)/d),v=Math.ceil((m+M)/d),A=Math.floor((g-M)/d),L=Math.ceil((g+M)/d),C=(k,H)=>h.clone().multiplyScalar(k).addScaledVector(u,H).addScaledVector(_,x);for(let k=E;k<=v;k++)c(C(k*d,A*d),C(k*d,L*d),k===0?y:p,1);for(let k=A;k<=L;k++)c(C(E*d,k*d),C(v*d,k*d),k===0?y:p,1)}this.set(a,l)}follow(e,t){if(!this.follows)return;let i=[e.x0,e.x1,e.y0,e.y1,e.stepX,e.stepY].join(",");if(i===this.shown)return;this.shown=i;let{right:r,up:s}=vi(t),o=[],a=[],l=(c,h,u,f,d,p)=>{let y=r.clone().multiplyScalar(c).addScaledVector(s,h),m=r.clone().multiplyScalar(u).addScaledVector(s,f);o.push(y.x,y.y,y.z,m.x,m.y,m.z),a.push(...d,p,...d,p)};if(this.kind==="axes"){let c=wt(this.theme.foreground);e.y0<=0&&e.y1>=0&&l(e.x0,0,e.x1,0,c,.5),e.x0<=0&&e.x1>=0&&l(0,e.y0,0,e.y1,c,.5)}else{let c=wt(this.theme.grid),h=wt(_n(this.theme.grid,this.theme.foreground,.3));for(let u of mh(e.x0,e.x1,e.stepX))l(u,e.y0,u,e.y1,u===0?h:c,1);for(let u of mh(e.y0,e.y1,e.stepY))l(e.x0,u,e.x1,u,u===0?h:c,1)}this.set(o,a)}extend(){}dispose(){this.lines.geometry.dispose(),this.lines.material.dispose()}},WE=100,$E=150;function My(n,e,t){return new mn(n,e,{samples:t,depthBuffer:!0,stencilBuffer:!0,minFilter:xt,magFilter:xt,generateMipmaps:!1})}function jE(){let n=new Pn({glslVersion:ia,uniforms:{uUnderlay:{value:null}},vertexShader:"void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",fragmentShader:"uniform sampler2D uUnderlay; out vec4 color; void main() { color = texelFetch(uUnderlay, ivec2(gl_FragCoord.xy), 0); }",depthTest:!1,depthWrite:!1,blending:Ni}),e=new Jt(new Hr(2,2),n);e.frustumCulled=!1;let t=new Fr;return t.add(e),{scene:t,camera:new Ln,material:n}}function XE(n,e){n.updateMatrixWorld();let t=n.matrixWorld.elements,i=n.projectionMatrix.elements,r=!1;for(let s=0;s<16;s++)e[s]!==t[s]&&(r=!0,e[s]=t[s]),e[16+s]!==i[s]&&(r=!0,e[16+s]=i[s]);return r}function qE(n,e){return n.x<e.x+e.z&&e.x<n.x+n.z&&n.y<e.y+e.w&&e.y<n.y+n.w}var df=class{id;scene=new Fr;staticScene=new Fr;underlay=new at(-1,-1,-1,-1);underlayDirty=!0;staticKey="";rebuiltAt=-1/0;coarse=!1;cameraSeen=new Float64Array(32);camera=new Ln;cameraSpec={kind:"2d",plane:"xy"};controls=null;element=null;labels=null;clearance={header:0,bars:null};plan=null;error=null;draws=new Map;rect={x:0,y:0,w:1,h:1};outer={x:0,y:0,w:1,h:1};window=null;atWindow=!1;content="";needsFit=!0;userMoved=!1;fitting=!1;halfWidth=1;halfHeight=1;box=null;target=new O;turned=0;view=null;constructor(e){this.id=e}},wy=n=>JSON.stringify(n),YE=n=>n.kind==="3d"&&(n.auto_rotate??0)!==0,yh=class{canvas;onChange=()=>{};gl;ctx;panels=new Map;lastState=null;size={w:0,h:0,ratio:0};background;cacheStatic;coarseDrags;refineTimer=null;blit;underlay=null;scratch=null;viewport=new at;cssViewport=new at;cssScissor=new at;buffer=new Pe;region=new Xo;corner=new Pe;constructor(e,t,i,r={}){this.canvas=e,qe.enabled=!1,this.gl=new rh({canvas:e,antialias:!0,stencil:!0,preserveDrawingBuffer:r.preserveDrawingBuffer??!1}),this.cacheStatic=r.cacheStatic??!0,this.coarseDrags=r.coarseDrags??!0,this.blit=jE(),e.addEventListener("webglcontextrestored",()=>{for(let o of this.panels.values())o.underlayDirty=!0}),this.gl.outputColorSpace=Or,this.gl.autoClear=!1;let s=r.theme??Ga(t);this.background=new je(...wt(s.background)),this.ctx={scene:t,geometry:i,shared:new of,theme:s,disc:ME()}}setTheme(e){this.ctx.theme=e,this.background.setRGB(...wt(e.background)),this.lastState=null;for(let t of this.panels.values())t.underlayDirty=!0}panel(e){let t=this.panels.get(e);return t||(t=new df(e),this.panels.set(e,t)),t}bind(e,t){let i=this.panel(e);i.element!==t&&(i.controls?.dispose(),i.controls=null,i.labels?.remove(),i.labels=null,i.element=t,t!==null&&(i.labels=document.createElement("div"),i.labels.className="labels",t.append(i.labels),this.makeControls(i)))}setClearance(e,t){this.panel(e).clearance=t}refit(e){let t=this.panels.get(e);t&&(t.needsFit=!0,t.userMoved=!1)}refitAll(){for(let e of this.panels.keys())this.refit(e)}offKeys(e){let t=this.panels.get(e);return t!==void 0&&t.userMoved&&t.cameraSpec.kind==="2d"&&t.cameraSpec.keyframes!==void 0}orbitPanels(){return[...this.panels.values()].filter(e=>e.cameraSpec.kind==="3d"&&e.controls!==null).map(e=>e.id)}viewFrom(e,t,i){let r=this.panels.get(e);if(r===void 0||r.cameraSpec.kind!=="3d"||r.controls===null)return;let s=r.controls.target,o=r.camera.position.distanceTo(s),a=h=>new O(h==="x"?1:0,h==="y"?1:0,h==="z"?1:0),l=a(t).multiplyScalar(i),c=r.cameraSpec.up??"z";t===c&&l.addScaledVector(a({x:"z",y:"x",z:"y"}[c]),-i*1e-4).normalize(),r.camera.position.copy(s).addScaledVector(l,o),r.camera.lookAt(s),r.controls.update()}turnBy(e,t){let i=this.panels.get(e);i===void 0||i.cameraSpec.kind!=="3d"||i.controls===null||i.controls.rotateLeft(t*Math.PI/180)}makeControls(e){if(e.controls?.dispose(),e.controls=null,e.element===null)return;e.camera.up.copy(vi(e.cameraSpec).up);let t=new lh(e.camera,e.element);t.enableDamping=!1,t.screenSpacePanning=!0,e.cameraSpec.kind==="2d"&&(t.enableRotate=!1,t.zoomToCursor=!0,t.mouseButtons={LEFT:jn.PAN,MIDDLE:jn.DOLLY,RIGHT:jn.PAN},t.touches={ONE:ti.PAN,TWO:ti.DOLLY_PAN}),t.addEventListener("change",()=>{e.fitting||(e.userMoved=!0,this.onChange())}),e.controls=t}setCamera(e,t){e.cameraSpec=t;let i=t.kind==="2d"||t.projection==="orthographic";e.camera=i?new Ln(-1,1,1,-1,-1,1):new cn(35,1,.01,100);let r=$s(t);e.scene.scale.copy(r),e.staticScene.scale.copy(r),e.underlayDirty=!0,e.needsFit=!0,e.userMoved=!1,this.makeControls(e)}drawStatic(e){if(e.staticScene.children.length===0)return;if(!this.cacheStatic||YE(e.cameraSpec)){this.gl.render(e.staticScene,e.camera);return}let t=this.gl.getDrawingBufferSize(this.buffer);if(this.underlay===null||this.underlay.width!==t.x||this.underlay.height!==t.y){this.underlay?.dispose(),this.underlay=My(t.x,t.y,0),this.gl.initRenderTarget(this.underlay);for(let r of this.panels.values())r.underlayDirty=!0}let i=this.gl.getCurrentViewport(this.viewport);if(i.equals(e.underlay)||(e.underlay.copy(i),e.underlayDirty=!0),XE(e.camera,e.cameraSeen)&&(e.underlayDirty=!0),e.underlayDirty){e.underlayDirty=!1;let r=performance.now();e.coarse=this.coarseDrags&&r-e.rebuiltAt<WE,e.rebuiltAt=r,e.coarse?(this.drawCoarse(e,this.underlay,i),this.scheduleRefine()):this.drawFine(e,this.underlay,i);for(let s of this.panels.values())s!==e&&qE(s.underlay,i)&&(s.underlayDirty=!0);this.gl.setViewport(this.gl.getViewport(this.cssViewport)),this.gl.setScissor(this.gl.getScissor(this.cssScissor))}this.blit.material.uniforms.uUnderlay.value=this.underlay.texture,this.gl.render(this.blit.scene,this.blit.camera)}drawCoarse(e,t,i){t.viewport.copy(i),t.scissor.copy(i),t.scissorTest=!0,this.gl.setRenderTarget(t),this.gl.clear(!0,!1,!0),this.gl.render(e.staticScene,e.camera),this.gl.setRenderTarget(null)}scheduleRefine(){this.refineTimer!==null&&clearTimeout(this.refineTimer),this.refineTimer=setTimeout(()=>{this.refineTimer=null;for(let e of this.panels.values())e.coarse&&(e.underlayDirty=!0,e.rebuiltAt=-1/0);this.onChange()},$E)}drawFine(e,t,i){let r=this.scratch;(r===null||r.width<i.z||r.height<i.w)&&(r?.dispose(),r=this.scratch=My(Math.max(i.z,r?.width??0),Math.max(i.w,r?.height??0),4)),r.viewport.set(0,0,i.z,i.w),r.scissor.set(0,0,i.z,i.w),r.scissorTest=!0,this.gl.setRenderTarget(r),this.gl.clear(!0,!1,!0),this.gl.render(e.staticScene,e.camera),this.gl.setRenderTarget(null),this.region.min.set(0,0),this.region.max.set(Math.min(i.z,t.width-i.x),Math.min(i.w,t.height-i.y)),this.gl.copyTextureToTexture(r.texture,t.texture,this.region,this.corner.set(i.x,i.y))}disposePanel(e){for(let t of e.draws.values())t.dispose();e.draws.clear(),e.controls?.dispose(),e.labels?.remove(),this.panels.delete(e.id)}replan(e,t){let i=this.ctx.scene,r;try{r=EE(i,this.ctx.geometry,t,e.id),e.error=null}catch(d){if(!(d instanceof Qt))throw d;e.error=d.message,e.plan=null;for(let p of e.draws.values())p.group.visible=!1;return}let s=e.plan,o=r.declared.camera??{kind:"2d",plane:"xy"};(s===null||s.declaredId!==r.declaredId||wy(o)!==wy(e.cameraSpec))&&this.setCamera(e,o);let a=TE(r);a!==e.content&&(e.content=a,e.needsFit=!0,e.userMoved=!1),e.plan=r;let l=new Set,c=JSON.stringify(this.ctx.theme);try{for(let d of r.layers){let p;if(d.kind==="trajectories"){if(d.set===null)continue;let b=`${JSON.stringify(d.color??null)}\0${c}`;p=`trajectory\0${r.declaredId}\0${d.index}\0${d.set.id}\0${r.display}\0${d.channel??""}\0${b}`}else if(d.kind==="arrow"){if(d.set===null)continue;let b=JSON.stringify([d.layer.color??null,c,d.layer.opacity,d.layer.width,d.layer.head]);p=`arrow\0${r.declaredId}\0${d.index}\0${d.set.id}\0${r.display}\0${d.channel}\0${b}`}else if(d.kind==="inset_box")p=`inset_box\0${r.declaredId}\0${d.index}\0${JSON.stringify([d.layer,c])}`;else if(d.kind==="points"||d.kind==="label"){if(d.kind==="points"&&d.set===null)continue;p=`${d.kind}\0${r.declaredId}\0${d.index}\0${d.set?.id??""}\0${r.display}\0${JSON.stringify(d.layer)}\0${c}`}else p=`${d.kind}\0${r.declaredId}\0${d.index}\0${r.display}\0${c}`;l.add(d.index);let y=e.draws.get(d.index);if(y!==void 0&&y.key===p){y.group.visible=!0;continue}y!==void 0&&(y.group.removeFromParent(),y.dispose(),e.draws.delete(d.index));let m=d.kind==="trajectories"?new dr(this.ctx,d,r.display,p):d.kind==="arrow"?new gh(this.ctx,d,p):d.kind==="inset_box"?new da(this.ctx,d.layer,p):d.kind==="body"?new fr(this.ctx,d.layer,p,()=>{e.underlayDirty=!0,this.onChange()}):d.kind==="points"?new ha(this.ctx,d.layer,p):d.kind==="label"?new ua(d.layer,p):new Ui(this.ctx,d.layer,e.cameraSpec,p);m.group.renderOrder=d.index;let g=0;for(let b of m.group.children)b.renderOrder=16*d.index+g++;e.draws.set(d.index,m),m instanceof Ui&&e.box!==null&&m.layout(e.box,e.cameraSpec,$s(e.cameraSpec))}}catch(d){if(!(d instanceof Qt))throw d;e.error=d.message,e.plan=null;for(let p of e.draws.values())p.group.visible=!1;return}for(let[d,p]of[...e.draws])l.has(d)||(p.group.removeFromParent(),p.dispose(),e.draws.delete(d));let h=[],u=!0;for(let d of r.layers){let p=e.draws.get(d.index);p!==void 0&&(u&&=p instanceof dr&&p.isStatic,(u?e.staticScene:e.scene).add(p.group),u&&h.push(p.key))}let f=h.join(`
`);f!==e.staticKey&&(e.staticKey=f,e.underlayDirty=!0)}advance(e,t,i){let r=e.plan;if(r===null)return;let s=this.ctx.scene,o={scope:r.scope,frames:this.ctx.geometry.frames,clock:s.clock,channel:t.clock.channel,q:i,display:r.display};e.error=null;let a=e.cameraSpec.kind==="2d"?Zr(e.cameraSpec):[0,1];try{for(let l of r.layers){let c=e.draws.get(l.index);c instanceof dr&&l.kind==="trajectories"?(c.planeAxes=a,c.update(l,s,i)&&c.isStatic&&(e.underlayDirty=!0),c.referenceContext&&c.place(o,r.reference)):c instanceof gh&&l.kind==="arrow"?c.update(Mi(o,l.layer),l):c instanceof da&&l.kind==="inset_box"?c.update(o,r.reference):c instanceof fr&&l.kind==="body"?c.update(o,l.layer,r.reference):c instanceof ha&&l.kind==="points"?c.update(Mi(o,l.layer),l):c instanceof ua&&l.kind==="label"&&c.update(o,l,r.reference)}}catch(l){if(!(l instanceof Qt))throw l;e.error=l.message}}fit(e){let t=new ei,i=e.plan===null?null:PE(e.plan,this.ctx.geometry);if(i!==null)t.set(new O(i[0],i[1],i[2]),new O(i[3],i[4],i[5]));else for(let d of e.draws.values())(d instanceof fr&&d.group.visible||d instanceof ha)&&d.extend(t);t.isEmpty()&&t.set(new O(-1,-1,-1),new O(1,1,1));let r=e.cameraSpec,s=$s(r),o=new ei(t.min.clone().multiply(s),t.max.clone().multiply(s)),a=o.getCenter(new O),l=o.getSize(new O),c=Math.max(l.length()/2,1e-9),{up:h,normal:u}=vi(r),f=e.camera;if(e.fitting=!0,f instanceof Ln){({halfWidth:e.halfWidth,halfHeight:e.halfHeight}=IE(o,r,e.rect.w/Math.max(1,e.rect.h)));let d=4*c+1,p=10*(a.length()+d+c);f.near=-p,f.far=p,f.zoom=1,f.position.copy(a).addScaledVector(u,d)}else{let d=c/Math.sin(f.fov*Math.PI/360)*1.08;f.near=d/1e3,f.far=d*1e3+a.length(),f.position.copy(a).addScaledVector(u,d)}f.up.copy(h),f.lookAt(a),e.target.copy(a),e.turned=0,this.aspect(e),e.controls&&(e.controls.target.copy(a),e.controls.update());for(let d of e.draws.values())d instanceof Ui&&d.layout(t,r,s);e.box=t,e.fitting=!1,e.needsFit=!1,e.atWindow=!1}aspect(e){let t=e.rect.w/Math.max(1,e.rect.h),i=e.camera;i instanceof Ln?(ph(e.cameraSpec)||(e.halfWidth=e.halfHeight*t),i.top=e.halfHeight,i.bottom=-e.halfHeight,i.left=-e.halfWidth,i.right=e.halfWidth):i.aspect=t,i.updateProjectionMatrix()}autoRotate(e,t){let i=e.cameraSpec;if(i.kind!=="3d"||i.auto_rotate===void 0)return;let r=i.auto_rotate*t*Math.PI/180,s=e.controls?.target??e.target;e.camera.position.sub(s).applyAxisAngle(vi(i).up,r-e.turned).add(s),e.camera.lookAt(s),e.turned=r}follow(e){let t=e.cameraSpec;if(e.view=t.kind==="2d"&&e.camera instanceof Ln?DE(e.camera,t,e.rect.w,e.rect.h):null,!(e.view===null||t.kind!=="2d"))for(let i of e.draws.values())i instanceof Ui&&i.follow(e.view,t)}renderAt(e,t,i,r,s){let o=Math.max(1,Math.floor(i)),a=Math.max(1,Math.floor(r));(o!==this.size.w||a!==this.size.h||s!==this.size.ratio)&&(this.gl.setPixelRatio(s),this.gl.setSize(o,a,!1),this.size={w:o,h:a,ratio:s});let l=Hn(this.ctx.scene.clock,t),c=dh(ma(e.layout,l),{x:0,y:0,w:o,h:a},bh);for(let f of[...this.panels.values()])Object.hasOwn(e.panels,f.id)||this.disposePanel(f);let h=e!==this.lastState;this.lastState=e;let u=new Map;this.gl.setScissorTest(!1),this.gl.setClearColor(this.background,1),this.gl.clear(),this.gl.setScissorTest(!0);for(let[f,d]of c.panels){let p=this.panel(f);(h||p.plan===null)&&this.replan(p,e);let m=JE(d,p.plan?.declared.margin),g=m.w!==p.rect.w||m.h!==p.rect.h;p.outer=d,p.rect=m,this.advance(p,e,t),p.needsFit||g&&!p.userMoved?this.fit(p):g&&this.aspect(p),this.keyed(p,e,t),this.autoRotate(p,t),this.follow(p);for(let M of p.draws.values())M instanceof fr&&M.clip(p.camera);let b=p.camera instanceof Ln?p.camera:null,_=b===null?1:p.rect.w/Math.max(1e-12,(b.right-b.left)/b.zoom),x=b===null?1:p.rect.h/Math.max(1e-12,(b.top-b.bottom)/b.zoom);for(let M of p.draws.values())M instanceof dr&&M.setPixels(_,x);for(let M of p.draws.values())M instanceof dr&&M.placeDash(p.camera,p.rect,o,a,1/s)}for(let[f]of c.panels){let d=this.panel(f),p=d.rect;if(d.error!==null){u.set(f,d.error);continue}if(p.w<1||p.h<1||sn(d.plan?.declared.opacity,l)<=0)continue;for(let m of d.draws.values())m.resize?.(p.w,p.h);for(let m of d.draws.values())m instanceof da&&m.place(d,m.target===null?void 0:this.panels.get(m.target));let y=a-p.y-p.h;this.gl.setViewport(p.x,y,p.w,p.h),this.gl.setScissor(p.x,y,p.w,p.h),this.drawStatic(d),this.gl.render(d.scene,d.camera),this.placeLabels(d)}return this.gl.setScissorTest(!1),u}labelItems(e){if(e.plan===null)return[];let t=[],i=[],r=[],s=this.ctx.scene.frames[e.plan.display],o=s?.axes??["x","y","z"],{normal:a}=vi(e.cameraSpec),l=$s(e.cameraSpec),c=e.rect.x-e.outer.x,h=e.rect.y-e.outer.y,u=NE(e.clearance,e.outer.w),f=(y,m,g,b)=>{let _=m.clone().multiply(l).project(e.camera),x=(_.x+1)/2*e.rect.w+g,M=(1-_.y)/2*e.rect.h,E=_.z>-1&&_.z<1&&x>=0&&x<=e.rect.w&&M>=0&&M<=e.rect.h,v={text:y,x:x+c,y:M+h,hidden:b||!E};return t.push(v),v},d=[...e.draws.values()].filter(y=>y instanceof Ui);if(e.view!==null&&e.cameraSpec.kind==="2d"){let[y,m]=Zr(e.cameraSpec),g=x=>o[x]&&s?.unit?`${o[x]} [${s.unit}]`:o[x]??"",b=d.some(x=>x.follows&&x.kind==="axes"),_=d.some(x=>x.ticks);for(let x of OE(e.view,_,b?[g(y),g(m)]:null,e.clearance.header-h)){let M={...x,x:x.x+c,y:x.y+h,hidden:!1};t.push(M),x.kind==="title"&&i.push(M)}}for(let y of e.draws.values())if(y instanceof Ui&&y.kind==="axes"&&!y.follows&&y.box===null)y.tips.forEach((m,g)=>{let b=o[g]??"",_=l.getComponent(g),x=b!==""&&_!==1?`${b} \xD7${Number(_.toPrecision(4))}`:b;i.push(f(x,m,4,e.cameraSpec.kind==="2d"&&Math.abs(m.clone().normalize().dot(a))>.99))});else if(y instanceof fr&&y.label!==null&&y.at!==null&&y.group.visible){let m=f(y.label,y.at,y.size/2+3,!1);if(u!==null&&xy(m,u)){t.pop();let g=f(y.label,y.at,-(y.size/2+3),!1);g.align="end",r.push(g)}else r.push(m)}if(u!==null)for(let y of t)xy(y,u)&&(y.hidden=!0);let p=r.filter(y=>!y.hidden);for(let y of i)p.some(m=>kE(y,m))&&(y.hidden=!0);return t}labels(e){let t=this.panels.get(e);return t===void 0?[]:this.labelItems(t).filter(i=>!i.hidden).map(({hidden:i,...r})=>r)}colorbars(e){let t=this.panels.get(e),i=[];if(t===void 0)return i;for(let r of t.draws.values()){if(!(r instanceof dr)||!r.group.visible)continue;let s=r.colorbar();s!==null&&i.push(s)}return uy(i)}placeLabels(e){let t=e.labels;if(t===null)return;let i=this.labelItems(e);for(;t.children.length<i.length;)t.appendChild(document.createElement("span"));for(;t.children.length>i.length;)t.lastChild.remove();i.forEach((r,s)=>{let o=t.children[s];o.textContent!==r.text&&(o.textContent=r.text),o.hidden=r.hidden;let a=r.align==="center"?"-50%":r.align==="end"?"-100%":"0";o.style.transformOrigin="0 0",o.style.fontSize=r.kind==="title"?"13px":"",o.style.transform=`translate(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px)${r.rotate?" rotate(-90deg)":""} translate(${a}, -50%)`})}keyed(e,t,i){let r=e.cameraSpec;if(e.window=null,r.kind!=="2d"||r.keyframes===void 0||e.plan===null||e.userMoved||!(e.camera instanceof Ln))return;let s=this.ctx.scene,o={scope:e.plan.scope,frames:this.ctx.geometry.frames,clock:s.clock,channel:t.clock.channel,q:i,display:e.plan.display},a;try{a=Gh(o,e.plan.declared,this.ctx.geometry.sets,e.plan.reference)}catch(b){if(!(b instanceof Qt))throw b;e.error=b.message;return}if(a===null){e.atWindow&&this.fit(e);return}e.window=a,e.atWindow=!0;let l=e.camera,{right:c,up:h,normal:u}=vi(r),f=e.rect.w/Math.max(1,e.rect.h),d=a.width/2,p=a.height!==null?a.height/2:d/f,y=l.position.dot(u),m=c.clone().multiplyScalar(a.center[0]).addScaledVector(h,a.center[1]),g=m.clone().addScaledVector(u,e.target.dot(u));e.fitting=!0,e.halfWidth=d,e.halfHeight=p,l.left=-d,l.right=d,l.top=p,l.bottom=-p,l.zoom=1,l.position.copy(m).addScaledVector(u,y),l.up.copy(h),l.lookAt(g),l.updateProjectionMatrix(),e.target.copy(g),e.controls&&(e.controls.target.copy(g),e.controls.update()),e.fitting=!1}async ready(){let e=[];for(let t of this.panels.values())for(let i of t.draws.values())i instanceof fr&&e.push(i.ready);await Promise.all(e)}paintInfo(e){let t=this.panels.get(e);if(t===void 0||t.plan===null||t.error!==null)return null;let i=this.ctx.scene,r=$s(t.cameraSpec),s=c=>{let h=c.clone().multiply(r).project(t.camera);return h.z>-1&&h.z<1?[t.rect.x+(h.x+1)/2*t.rect.w,t.rect.y+(1-h.y)/2*t.rect.h]:null},o=[],a=null,l;for(let c of t.plan.layers){let h=t.draws.get(c.index);if(h instanceof ua){let u=h.layer.at,f,d=u!==null&&typeof u=="object"&&"screen"in u&&u.screen!==void 0;d?f=[t.rect.x+u.screen[0]*t.rect.w,t.rect.y+u.screen[1]*t.rect.h]:f=h.at===null?null:s(h.at),f!==null&&o.push({layer:h.layer,x:f[0],y:f[1],clip:!d})}else if(h instanceof Ui&&h.box!==null&&t.view!==null&&t.cameraSpec.kind==="2d"){let u=i.frames[t.plan.display],f=u?.axes??["","",""],[d,p]=Zr(t.cameraSpec),y=g=>f[g]&&u?.unit?`${f[g]} [${u.unit}]`:f[g]??"",m=h.box.ticks??["x","y"];a={rect:t.rect,x0:t.view.x0,x1:t.view.x1,y0:t.view.y0,y1:t.view.y1,ticks:{x:m.includes("x"),y:m.includes("y")},size:h.box.size??ey,titles:[y(d),y(p)],opacity:h.box.opacity},l=h.box.titles}}return{outer:t.outer,rect:t.rect,opacity:t.plan.declared.opacity,labels:o,box:a,...l!==void 0?{boxTitles:l}:{}}}dispose(){for(let e of[...this.panels.values()])this.disposePanel(e);this.refineTimer!==null&&clearTimeout(this.refineTimer),this.blit.material.dispose(),this.underlay?.dispose(),this.scratch?.dispose(),this.ctx.disc.dispose(),this.gl.dispose(),this.gl.forceContextLoss()}};function JE(n,e){if(e===void 0)return n;let t=Math.round((e.left??0)*n.w),i=Math.round((e.right??0)*n.w),r=Math.round((e.top??0)*n.h),s=Math.round((e.bottom??0)*n.h);return{x:n.x+t,y:n.y+r,w:Math.max(0,n.w-t-i),h:Math.max(0,n.h-r-s)}}function ma(n,e){if(n.kind==="panel")return n;let t=ma(n.a,e),i=ma(n.b,e),r=n.keyframes===void 0?n.ratio:Math.min(1,Math.max(0,Jr(n.keyframes,e)));return t===n.a&&i===n.b&&r===n.ratio?n:{...n,ratio:r,a:t,b:i}}var Ge=n=>{let e=parseFloat(n);return Number.isFinite(e)?e:0};function Cy(n){let e=[],t=0,i=0;for(let r=0;r<n.length;r++)n[r]==="("?t++:n[r]===")"?t--:n[r]===","&&t===0&&(e.push(n.slice(i,r).trim()),i=r+1);return e.push(n.slice(i).trim()),e.filter(r=>r!=="")}var Py=/^(rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+)/i;function Iy(n){return n==="none"||n===""?[]:Cy(n).map(e=>{let t=Py.exec(e)?.[0]??"transparent",i=e.slice(t.length),r=[...i.matchAll(/-?[\d.]+px/g)].map(s=>Ge(s[0]));return{color:t,x:r[0]??0,y:r[1]??0,blur:r[2]??0,spread:r[3]??0,inset:/\binset\b/.test(i)}})}function ZE(n){let e=/^linear-gradient\((.*)\)$/.exec(n.trim());if(e===null)return null;let t=Cy(e[1]),i=[0,1],r={"to top":[0,-1],"to bottom":[0,1],"to left":[-1,0],"to right":[1,0]};if(r[t[0]]!==void 0)i=r[t.shift()];else if(/^-?[\d.]+deg$/.test(t[0])){let o=Ge(t.shift())*Math.PI/180;i=[Math.sin(o),-Math.cos(o)]}let s=t.map((o,a)=>{let l=Py.exec(o)?.[0]??"transparent",c=/(-?[\d.]+)%/.exec(o.slice(l.length));return[c===null?t.length===1?0:a/(t.length-1):Math.min(1,Math.max(0,Ge(c[1])/100)),l]});return{dir:i,stops:s}}var _h=n=>n==="transparent"||n===""||/rgba\([^)]*,\s*0\)$/.test(n);function Ly(n,e,t){let i=n.getTransform(),r=1e5;n.save(),n.shadowColor=e.color,n.shadowBlur=e.blur*Math.hypot(i.a,i.b),n.shadowOffsetX=-r*i.a+(e.x*i.a+e.y*i.c),n.shadowOffsetY=-r*i.b+(e.x*i.b+e.y*i.d),n.fillStyle="#000",t(r),n.restore()}function KE(n,e,t,i,r,s){let o=s.borderTopStyle==="none"?0:Ge(s.borderTopWidth),a=s.borderRightStyle==="none"?0:Ge(s.borderRightWidth),l=s.borderBottomStyle==="none"?0:Ge(s.borderBottomWidth),c=s.borderLeftStyle==="none"?0:Ge(s.borderLeftWidth),h=[[o,s.borderTopColor,[e,t,e+i,t,e+i-a,t+o,e+c,t+o]],[a,s.borderRightColor,[e+i,t,e+i,t+r,e+i-a,t+r-l,e+i-a,t+o]],[l,s.borderBottomColor,[e+i,t+r,e,t+r,e+c,t+r-l,e+i-a,t+r-l]],[c,s.borderLeftColor,[e,t+r,e,t,e+c,t+o,e+c,t+r-l]]];for(let[u,f,d]of h)if(!(u<=0||_h(f))){n.fillStyle=f,n.beginPath(),n.moveTo(d[0],d[1]);for(let p=2;p<8;p+=2)n.lineTo(d[p],d[p+1]);n.closePath(),n.fill()}}function Dy(n,e,t,i,r,s){for(let a of Iy(s.boxShadow).reverse())a.inset||_h(a.color)||(a.blur===0?(n.fillStyle=a.color,n.fillRect(e+a.x-a.spread,t+a.y-a.spread,i+2*a.spread,r+2*a.spread)):Ly(n,a,l=>n.fillRect(e-a.spread+l,t-a.spread,i+2*a.spread,r+2*a.spread)));_h(s.backgroundColor)||(n.fillStyle=s.backgroundColor,n.fillRect(e,t,i,r));let o=ZE(s.backgroundImage);if(o!==null){let[a,l]=o.dir,c=(Math.abs(i*a)+Math.abs(r*l))/2,h=e+i/2,u=t+r/2,f=n.createLinearGradient(h-a*c,u-l*c,h+a*c,u+l*c);for(let[d,p]of o.stops)f.addColorStop(d,p);n.fillStyle=f,n.fillRect(e,t,i,r)}KE(n,e,t,i,r,s)}var ky=n=>n!=="none"&&n!==""&&!/^matrix\(1, 0, 0, 1, [^,]+, [^,]+\)$/.test(n),QE=n=>`${n.fontStyle} ${n.fontWeight} ${n.fontSize} ${n.fontFamily}`;function vh(n,e,t,i,r){i=tT(n,i),n.font=QE(r),n.textAlign="left",n.textBaseline="alphabetic",n.letterSpacing=r.letterSpacing==="normal"?"0px":r.letterSpacing;for(let s of Iy(r.textShadow).reverse())_h(s.color)||Ly(n,s,o=>n.fillText(e,t+o,i));n.fillStyle=r.color,n.fillText(e,t,i)}function eT(n,e){let t=n.getTransform(),i=Math.hypot(t.a,t.b)||1;n.font=`${e.fontStyle} ${e.fontWeight} ${Ge(e.fontSize)*i}px ${e.fontFamily}`;let r=n.measureText("Hg");return[Math.round(r.fontBoundingBoxAscent)/i,Math.round(r.fontBoundingBoxDescent)/i]}function Ny(n,e,t,i,r){let s=n.getTransform();if(s.b!==0||s.c!==0||s.a===0||s.d===0)return[e,t,i,r];let o=l=>(Math.round(l*s.a+s.e)-s.e)/s.a,a=l=>(Math.round(l*s.d+s.f)-s.f)/s.d;return[o(e),a(t),o(e+i)-o(e),a(t+r)-a(t)]}function tT(n,e){let t=n.getTransform();return t.b!==0||t.c!==0||t.d===0?e:(Math.round(e*t.d+t.f)-t.f)/t.d}function Oy(n,e){let t=e.getBoundingClientRect(),i=e.offsetWidth||t.width,r={x:t.left,y:t.top,scale:i>0?t.width/i:1,baselines:new Map},s=new Map;Fy(e,s);try{for(let[o,a]of s)r.baselines.set(o,js(r,a.getBoundingClientRect()).y);Uy(n,e,r,null)}finally{for(let o of s.values())o.remove()}}function Fy(n,e){if(!n.checkVisibility())return;let t=getComputedStyle(n);if(ky(t.transform))return;let i=/flex|grid/.test(t.display);for(let r of[...(n.shadowRoot??n).childNodes])if(r.nodeType===Node.TEXT_NODE&&!i&&r.data.trim()!==""){let s=document.createElement("tycho-probe");s.style.cssText="display: inline-block; width: 0; height: 0; margin: 0; padding: 0; border: 0; vertical-align: baseline;",r.parentNode.insertBefore(s,r),e.set(r,s)}else r instanceof HTMLElement&&!(r instanceof HTMLStyleElement)&&!(r instanceof HTMLScriptElement)&&Fy(r,e)}function js(n,e){return{x:(e.left-n.x)/n.scale,y:(e.top-n.y)/n.scale,w:e.width/n.scale,h:e.height/n.scale}}function Uy(n,e,t,i){if(!e.checkVisibility())return;let r=getComputedStyle(e),s=ky(r.transform),o,a,l,c;if(n.save(),i===null&&!s)({x:o,y:a,w:l,h:c}=js(t,e.getBoundingClientRect()));else{if(l=e.offsetWidth,c=e.offsetHeight,i!==null)[o,a]=[i.x+e.offsetLeft,i.y+e.offsetTop];else{let u=e.offsetParent,f=u===null?{x:0,y:0}:js(t,u.getBoundingClientRect()),d=u===null?null:getComputedStyle(u);o=f.x+e.offsetLeft+(d===null?0:Ge(d.borderLeftWidth)),a=f.y+e.offsetTop+(d===null?0:Ge(d.borderTopWidth))}if(s){let[u,f]=r.transformOrigin.split(" ").map(Ge),d=new DOMMatrix(r.transform);n.translate(o+u,a+f),n.transform(d.a,d.b,d.c,d.d,d.e,d.f),n.translate(-u,-f),[o,a]=[0,0]}}let h=s||i!==null;if(n.globalAlpha*=Ge(r.opacity),s||([o,a,l,c]=Ny(n,o,a,l,c)),e instanceof HTMLCanvasElement?e.width>0&&e.height>0&&n.drawImage(e,o,a,l,c):Dy(n,o,a,l,c,r),r.overflowX!=="visible"||r.overflowY!=="visible"){let u=Ge(r.borderLeftWidth),f=Ge(r.borderTopWidth);n.beginPath(),n.rect(o+u,a+f,l-u-Ge(r.borderRightWidth),c-f-Ge(r.borderBottomWidth)),n.clip()}Ry(n,e,"::before",o,a,l,c,r);for(let u of(e.shadowRoot??e).childNodes)u.nodeType===Node.TEXT_NODE?nT(n,u,t,r,h?{x:o,y:a}:null):u instanceof HTMLElement&&!(u instanceof HTMLStyleElement)&&!(u instanceof HTMLScriptElement)&&Uy(n,u,t,h?u.offsetParent===e?{x:o,y:a}:i:null);Ry(n,e,"::after",o,a,l,c,r),n.restore()}function nT(n,e,t,i,r){let s=e.data;if(s.trim()==="")return;let[o,a]=eT(n,i);if(r!==null){let g=i.lineHeight==="normal"?o+a:Ge(i.lineHeight);vh(n,s,r.x+Ge(i.paddingLeft)+Ge(i.borderLeftWidth),r.y+Ge(i.paddingTop)+Ge(i.borderTopWidth)+(g-o-a)/2+o,i);return}let l=document.createRange();l.selectNodeContents(e);let c=l.getClientRects()[0];if(c===void 0)return;let h=js(t,c).y,u=t.baselines.get(e),f=g=>u===void 0?g+o:u+g-h,d=(g,b)=>{l.setStart(e,g),l.setEnd(e,b);let _=l.getClientRects()[0];return _===void 0?null:js(t,_)};if(/tabular-nums/.test(i.fontVariantNumeric)){for(let g=0;g<s.length;g++){let b=/\s/.test(s[g])?null:d(g,g+1);b!==null&&vh(n,s[g],b.x,f(b.y),i)}return}l.selectNodeContents(e);let p=[...l.getClientRects()],y=s.split(`
`);if(p.length===y.length){p.forEach((g,b)=>{let _=js(t,g);vh(n,y[b],_.x,f(_.y),i)});return}let m=0;for(let g of s.split(/(\s+)/)){let b=g.trim()===""?null:d(m,m+g.length);b!==null&&vh(n,g,b.x,f(b.y),i),m+=g.length}}function Ry(n,e,t,i,r,s,o,a){let l=getComputedStyle(e,t);if(l.content==="none"||l.content==="normal"||l.display==="none"||l.position!=="absolute")return;let c=i+Ge(a.borderLeftWidth),h=r+Ge(a.borderTopWidth),u=s-Ge(a.borderLeftWidth)-Ge(a.borderRightWidth),f=o-Ge(a.borderTopWidth)-Ge(a.borderBottomWidth),d=Ge(l.borderLeftWidth)+Ge(l.borderRightWidth)+Ge(l.paddingLeft)+Ge(l.paddingRight),p=Ge(l.borderTopWidth)+Ge(l.borderBottomWidth)+Ge(l.paddingTop)+Ge(l.paddingBottom),y=M=>M==="auto"||M==="",m=(M,E,v,A,L)=>{let C=y(v)?y(M)||y(E)?0:A-Ge(M)-Ge(E)-L:Ge(v);l.boxSizing==="border-box"&&!y(v)&&(C-=L);let k=C+L;return[y(M)?y(E)?0:A-Ge(E)-k:Ge(M),k]},[g,b]=m(l.left,l.right,l.width,u,d),[_,x]=m(l.top,l.bottom,l.height,f,p);n.save(),n.globalAlpha*=Ge(l.opacity),Dy(n,...Ny(n,c+g,h+_,b,x),l),n.restore()}function Mh(){return Object.create(null)}function Sh(n,e,t){let i=Mh();for(let[r,s]of Object.entries(n??{}))r!==e&&s!==void 0&&(i[r]=s);return t!==void 0&&(i[e]=t),i}var iT=(n,e)=>(n%e+e)%e,ya=class{snap;index=0;play=!1;frameCount;listeners=new Set;constructor(e,t){this.snap=e,this.frameCount=t}get state(){return this.snap}get frame(){return this.index}get playing(){return this.play}subscribe(e){return this.listeners.add(e),()=>this.listeners.delete(e)}emit(e){for(let t of[...this.listeners])t(e)}set(e){e!==this.snap&&(this.snap=e,this.emit("state"))}update(e){this.set(e(this.snap))}setFrame(e){if(!Number.isInteger(e))return;let t=iT(e,this.frameCount);t!==this.index&&(this.index=t,this.emit("frame"))}setPlaying(e){e!==this.play&&(this.play=e,this.emit("playing"))}};function qs(n,e,t,i,r){let s=ht(n,t);if(s===void 0||!Aa(s,i))return e;if(s.scope==="per_panel"){if(r===void 0||!Object.hasOwn(e.panels,r))return e;let o=e.panels[r];return o.inputs!==void 0&&Object.hasOwn(o.inputs,t)&&o.inputs[t]===i?e:pf(e,r,{...o,inputs:Sh(o.inputs,t,i)})}return e.inputs!==void 0&&Object.hasOwn(e.inputs,t)&&e.inputs[t]===i?e:{...e,inputs:Sh(e.inputs,t,i)}}function zy(n,e){return n.clock.channel===e?n:{...n,clock:{channel:e}}}function pf(n,e,t){return{...n,panels:Sh(n.panels,e,t)}}function ga(n,e){return{...n,layout:e}}function Hy(n,e){if(!Object.hasOwn(n.panels,e)||Object.keys(n.panels).length<2)return n;let t=wo(n.layout,e);return t===null?n:{...n,panels:Sh(n.panels,e,void 0),layout:t}}function rT(n){for(let e=Object.keys(n.panels).length+1;;e++){let t=`p${e}`;if(!Object.hasOwn(n.panels,t))return t}}function mf(n,e,t){return n.kind==="panel"?n.id===e?{kind:"panel",id:t}:n.id===t?{kind:"panel",id:e}:n:{...n,a:mf(n.a,e,t),b:mf(n.b,e,t)}}function sT(n,e,t){let r=[t,...So(n.layout)].map(s=>n.panels[s]).find(s=>s!==void 0&&s.panel===e);return{panel:e,inputs:Object.assign(Mh(),r?.inputs)}}function wh(n,e,t,i,r,s=1/0){if(!Object.hasOwn(e.panels,t))return e;let o=e.panels[t];if(r.kind==="panel"){if(r.id===t||!Object.hasOwn(e.panels,r.id))return e;if(i==="centre")return ga(e,mf(e.layout,r.id,t));let l=wo(e.layout,r.id);return l===null?e:ga(e,Mo(l,t,r.id,i))}if(!Object.hasOwn(n.panels,r.panel))return e;if(i==="centre")return o.panel===r.panel?e:pf(e,t,{...o,panel:r.panel});if(Object.keys(e.panels).length>=s)return e;let a=rT(e);return ga(pf(e,a,sT(e,r.panel,t)),Mo(e.layout,t,a,i))}function yf(n,e,t,i,r){if(Object.keys(e.panels).length>=i)return e;let s=dl(e.layout).reduce((o,a)=>a.area>o.area?a:o);return wh(n,e,s.id,r(s.id)?"bottom":"right",t,i)}function Vy(n,e,t){let i=Object.keys(n.panels).length>=t,r=So(n.layout),s=r.map(e),o=[{label:"Add panel",placement:{kind:"add"},disabled:i,group:!1}];return r.forEach((a,l)=>{let h=s.filter(u=>u===s[l]).length>1?`${s[l]} (${s.slice(0,l+1).filter(u=>u===s[l]).length})`:s[l];o.push({label:`Split ${h} right`,placement:{kind:"drop",target:a,zone:"right"},disabled:i,group:!0},{label:`Split ${h} below`,placement:{kind:"drop",target:a,zone:"bottom"},disabled:i,group:!1},{label:`Replace ${h}`,placement:{kind:"drop",target:a,zone:"centre"},disabled:!1,group:!1})}),o}function Gy(n,e,t,i,r,s){return t.kind==="add"?yf(n,e,i,r,s):wh(n,e,t.target,t.zone,i,r)}function oT(n){let e=new TextEncoder().encode(n),t=2166136261;for(let i of e)t^=i,t=Math.imul(t,16777619)>>>0;return t.toString(16).padStart(8,"0")}function Eh(n){return`tycho:state:${oT(n)}:${n.length}`}var Xs=n=>n!==null&&typeof n=="object"&&!Array.isArray(n);function By(n,e,t){let i=Mh();if(!Xs(e))return i;for(let[r,s]of Object.entries(e)){let o=ht(n,r);o===void 0||(o.scope??"shared")!==t||!Aa(o,s)||(i[r]=s)}return i}function aT(n){if(n!==void 0)try{return li(n,"a split",Ma).map(e=>[...e])}catch{return}}function gf(n,e,t){if(!Xs(n))return;if(n.kind==="panel")return typeof n.id!="string"?void 0:!e(n.id)||t.has(n.id)?null:(t.add(n.id),{kind:"panel",id:n.id});if(n.kind!=="split"||n.dir!=="row"&&n.dir!=="col")return;let i=gf(n.a,e,t),r=gf(n.b,e,t);if(i===void 0||r===void 0)return;if(i===null)return r;if(r===null)return i;let s=n.ratio,o=typeof s=="number"&&s>0&&s<1?s:.5,a={kind:"split",dir:n.dir,ratio:o,a:i,b:r},l=aT(n.keyframes);return l!==void 0&&(a.keyframes=l),a}function Wy(n,e){let t=()=>structuredClone(n.initial);if(!Xs(e)||!Xs(e.clock)||!Xs(e.panels))return t();let i=e.clock.channel;if(typeof i!="string"||!n.clock.channels.includes(i))return t();let r=Mh();for(let[c,h]of Object.entries(e.panels))!Sa.test(c)||!Xs(h)||typeof h.panel!="string"||!Object.hasOwn(n.panels,h.panel)||(r[c]={panel:h.panel,inputs:By(n,h.inputs,"per_panel")});let s=gf(e.layout,c=>Object.hasOwn(r,c),new Set);if(s==null)return t();let o=new Set,a=c=>c.kind==="panel"?void o.add(c.id):(a(c.a),a(c.b));a(s);for(let c of Object.keys(r))o.has(c)||delete r[c];if(Object.keys(r).length===0)return t();let l={inputs:By(n,e.inputs,"shared"),clock:{channel:i},panels:r,layout:s};try{Kr(n,l)}catch{return t()}return l}var Th=8,lT=56,cT=[.25,.5,1,2,4],hT=[{keys:["X","Y","Z"],does:"view from axis"},{keys:[",","."],does:"turn 15\xB0",turn:!0},{keys:["Shift"],does:"other side \xB7 90\xB0"},{keys:["F"],does:"reset"}],uT=`
:host { display: block; position: relative; background: var(--bg); color: var(--fg);
  font-family: inherit; font-size: 13px; font-style: normal; font-weight: 400; line-height: 1.4; letter-spacing: normal;
  text-align: left; text-transform: none; overflow: hidden; min-height: 240px; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
:focus { outline: none; }
:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 2px; }
button, select, input { font: inherit; color: inherit; margin: 0; }
.root { position: absolute; inset: 0; display: grid; grid-template-rows: auto 1fr auto auto; }
.root.kiosk { grid-template-rows: 1fr; }
.root.kiosk header, .root.kiosk .stats, .root.kiosk footer, .root.kiosk .pheader { display: none; }
.root.picture { grid-template-rows: 1fr auto; }
.root.picture header, .root.picture footer, .root.picture .pheader { display: none; }
.root.minimal:not(.keep-panels) .add, .root.minimal:not(.keep-panels) .pheader .icon, .root.minimal .frame, .root.minimal .fps, .root.minimal .cap.view, .root.minimal .cap.export { display: none; }
.root.dragging, .root.dragging * { cursor: grabbing !important; }

header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 24px; padding: 10px 14px 8px; }
header h1 { font-size: 17px; font-weight: 600; margin: 0; letter-spacing: 0.01em; }
.vars { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; }
.vars:empty { display: none; }
.add { display: flex; align-items: center; min-width: 0; }
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.k { color: var(--dim); font-size: 12px; }
.chips > .k { margin-right: 2px; }
.field { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.field output { font-size: 12px; font-variant-numeric: lining-nums tabular-nums; min-width: 7ch; color: var(--fg); }

.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; background: var(--surface); }
.seg button { background: none; color: var(--dim); border: 0; padding: 4px 10px; cursor: pointer; white-space: nowrap; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button:hover { background: var(--raised); color: var(--fg); }
.seg button[aria-pressed="true"] { background: var(--accent-tint); color: var(--fg); box-shadow: inset 0 -2px var(--accent); }
.seg button:focus-visible { outline-offset: -2px; }
.mini .seg button { padding: 1px 7px; font-size: 11px; }
.icon { width: 28px; height: 28px; flex: none; display: inline-grid; place-items: center; padding: 0; border: 0; border-radius: 6px;
  background: none; color: var(--dim); cursor: pointer; }
.icon:hover { background: var(--raised); color: var(--fg); }
.icon svg { width: 16px; height: 16px; }
.icon.play { color: var(--fg); }
.icon.play.on { color: var(--accent); }
.btn { display: inline-flex; align-items: center; gap: 6px; background: var(--surface); color: var(--fg); border: 1px solid var(--line);
  border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.btn:hover { background: var(--raised); }
.btn svg { width: 14px; height: 14px; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #000; }
.btn.primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn.primary:active { background: var(--accent-press); border-color: var(--accent-press); }
.btn:disabled { opacity: 0.45; cursor: default; }
.btn[aria-expanded="true"] .chev { transform: rotate(180deg); color: var(--accent-2); }
select { background: var(--surface); color: var(--fg); border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; cursor: pointer; }
select option { background: var(--raised); color: var(--fg); }
input[type=checkbox] { accent-color: var(--accent); }

input[type=range] { -webkit-appearance: none; appearance: none; background: none; width: 200px; height: 18px; cursor: pointer; --p: 0%; }
input[type=range]::-webkit-slider-runnable-track { height: 4px; border-radius: 2px;
  background: linear-gradient(to right, var(--accent) var(--p), var(--track) var(--p)); }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; margin-top: -5px;
  border: 0; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px var(--bg); }
input[type=range]:hover::-webkit-slider-thumb { background: var(--accent-hover); }
input[type=range]::-moz-range-track { height: 4px; border-radius: 2px; background: var(--track); }
input[type=range]::-moz-range-progress { height: 4px; border-radius: 2px; background: var(--accent); }
input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px var(--bg); }
input[type=range]:disabled { opacity: 0.4; cursor: default; }
.mini input[type=range] { width: 90px; }

.chip { display: inline-flex; align-items: stretch; border: 1px solid var(--line); border-radius: 6px; background: var(--surface);
  color: var(--fg); user-select: none; -webkit-user-select: none; white-space: nowrap; }
.chip .body { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px 3px 4px; cursor: grab; touch-action: none; border-radius: 5px; }
.chip .body:not(:last-child) { border-radius: 5px 0 0 5px; }
.chip .body:hover, .chip .caret:hover { background: var(--raised); }
.chip .body:focus-visible { outline-offset: -2px; }
.chip .grip { width: 14px; height: 14px; flex: none; color: var(--dim); }
.chip .caret { position: relative; display: inline-grid; place-items: center; min-width: 24px; padding: 0 4px; border: 0;
  border-left: 1px solid var(--line); border-radius: 0 5px 5px 0; background: none; color: var(--dim); cursor: pointer; }
.chip .caret svg { width: 14px; height: 14px; transition: transform 0.15s; }
.chip .caret[aria-expanded="true"] { color: var(--accent-2); }
.chip .caret[aria-expanded="true"] svg { transform: rotate(180deg); }
.chip .caret select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
.chip .caret:has(select:focus-visible) { outline: 2px solid var(--accent-2); outline-offset: 2px; color: var(--accent-2); }
.chip.source { opacity: 0.4; }
.ghost { position: fixed; left: 0; top: 0; z-index: 30; pointer-events: none; transform: translate(12px, 12px);
  border-color: var(--accent-2); background: var(--raised); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5); }
.ghost .grip { visibility: visible !important; }

.menu { position: fixed; z-index: 40; min-width: 180px; max-height: 70vh; overflow: auto; display: flex; flex-direction: column; padding: 4px;
  background: var(--raised); border: 1px solid var(--line); border-radius: 6px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55); }
.menu button { text-align: left; background: none; border: 0; border-radius: 4px; padding: 5px 10px; color: var(--fg); cursor: pointer; white-space: nowrap; }
.menu button:hover:not(:disabled) { background: var(--accent-tint); }
.menu button:focus-visible { outline-offset: -2px; }
.menu button:disabled { color: var(--dim); cursor: default; }
.menu hr { border: 0; border-top: 1px solid var(--line); margin: 4px 2px; }

.panel-area { position: relative; min-height: 120px; overflow: hidden; background: var(--gutter); }
.panel-area canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.panel-area canvas.paint { pointer-events: none; }
.panels { position: absolute; inset: 0; }
.panel { position: absolute; overflow: hidden; }
.pbody { position: absolute; inset: 0; }
.pheader { position: absolute; top: 0; left: 0; right: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px;
  padding: 3px 3px 3px 6px; background: var(--header); cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none;
  font-size: 12px; white-space: nowrap; min-width: 0; }
.pheader .t { font-weight: 600; flex: 0 1 auto; min-width: 2em; overflow: hidden; text-overflow: ellipsis; }
.pheader .m { color: var(--dim); flex: 0 10 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.pheader .pc { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; flex: 0 1 auto; min-width: 0; }
.pheader select { padding: 0 4px; font-size: 11px; }
.pheader .sp { flex: 1 0 0; }
.pheader .icon { width: 24px; height: 24px; }
.pheader .chip { min-width: 0; }
.pheader .chip .body { padding: 1px 6px 1px 2px; min-width: 0; }
.pheader .chip .lbl { overflow: hidden; text-overflow: ellipsis; }
.pheader .chip .grip { visibility: hidden; }
.pheader .chip:is(:hover, :focus-within) .grip { visibility: visible; }
.labels, .preadout, .perror, .drop, .cbars { pointer-events: none; }
.labels { position: absolute; inset: 0; z-index: 1; overflow: hidden; }
.labels span { position: absolute; left: 0; top: 0; white-space: nowrap; color: var(--fg); font-size: 12px; text-shadow: 0 0 3px var(--bg), 0 0 3px var(--bg); }
/* the colorbars sit between the header, whose height the viewer writes as --header-height, and the row of x tick numbers, and shrink to fit */
.cbars { position: absolute; right: 10px; top: calc(var(--header-height, 30px) + 10px); bottom: 40px; z-index: 1; display: flex; align-items: flex-start; gap: 12px; }
.cbars.tight > .cbar { display: none; }
.cbar { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; max-height: 100%; font-size: 11px; color: var(--dim); }
.cbar-t { flex: none; max-width: 9em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cbar-b { display: flex; gap: 5px; height: 120px; flex: 0 1 auto; min-height: 0; }
.cbar-g { position: relative; width: 8px; border: 1px solid var(--line); }
.cbar-g.live { width: 12px; pointer-events: auto; cursor: ns-resize; touch-action: none; }
.cbar-g.live:hover { border-color: var(--dim); }
.cbar-k { position: absolute; left: -3px; right: -3px; background: var(--fg); opacity: 0.18; }
.cbar-g i { position: absolute; left: -9px; right: 0; bottom: 0; height: 0; }
.cbar-g i::before { content: ""; position: absolute; left: 0; top: -4px; border: 4px solid transparent; border-left: 6px solid var(--highlight); border-right: 0; }
.cbar-g.live i::after { content: ""; position: absolute; left: 9px; right: 0; top: -1px; height: 2px; background: var(--highlight); box-shadow: 0 0 0 1px var(--bg); }
.cbar-n { display: flex; flex-direction: column; justify-content: space-between; font-variant-numeric: tabular-nums; }
.preadout { position: absolute; left: 8px; bottom: 6px; z-index: 1; display: flex; flex-direction: column; gap: 6px;
  text-shadow: 0 0 3px var(--bg), 0 0 3px var(--bg); }
.perror { position: absolute; inset: 34px 12px auto 12px; z-index: 1; color: var(--error); white-space: pre-wrap; }
.drop { position: absolute; inset: 0; z-index: 3; display: grid; place-items: center; background: var(--accent-2-tint); border: 2px solid var(--accent-2); }
.pbody .follow { position: absolute; right: 8px; bottom: 8px; z-index: 2; padding: 3px 10px 3px 8px; font: inherit; font-size: 12px; cursor: pointer; }
.pbody .follow[hidden] { display: none; }
.pbody .hint { position: absolute; left: 8px; right: 8px; bottom: 8px; z-index: 2; width: fit-content; margin: 0 auto; display: flex; flex-wrap: wrap;
  justify-content: center; gap: 6px 18px; padding: 5px 9px; border-radius: 6px; background: var(--header); color: var(--dim);
  font-size: 11px; line-height: 1.3;
  pointer-events: none; opacity: 0; transition: opacity 0.2s; }
.hint .g { display: grid; justify-items: center; gap: 3px; white-space: nowrap; }
.hint .keys { display: inline-flex; align-items: center; gap: 3px; }
.hint kbd { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 4px; border: 1px solid var(--track); border-bottom-width: 2px;
  border-radius: 4px; background: var(--raised); color: var(--fg); font: inherit; font-weight: 600; line-height: 1; }
/* a comma and a period are too small to tell apart at the size of the letters */
.hint kbd.mark { align-items: end; padding-bottom: 7px; font-size: 17px; font-weight: 800; }
.hint svg { width: 13px; height: 13px; color: var(--fg); }
/* the keyframes are listed only where a pointer hovers, and not on a slide, where the audience would read them */
@media (hover: hover) { .pbody:hover .hint { opacity: 1; } }
.root.kiosk .hint, .root.minimal .hint, .root.picture .hint { display: none; }
.drop span { font-size: 11px; color: var(--fg); background: var(--raised); border-radius: 4px; padding: 1px 6px; }
.gutter { position: absolute; z-index: 2; touch-action: none; background: var(--gutter); }
.gutter.row { cursor: col-resize; }
.gutter.col { cursor: row-resize; }
.gutter:hover, .gutter.active { background: var(--accent-tint); }

.stats { display: flex; flex-direction: column; gap: 4px; padding: 8px 14px 0; }
.stats:empty { display: none; }
.readout dl { display: flex; flex-wrap: wrap; margin: 0; }
.wide dl > div { padding: 0 16px; border-left: 1px solid var(--line); }
.wide dl > div:first-child { border-left: 0; padding-left: 0; }
.stack dl { flex-direction: column; gap: 2px; }
.readout dt { font-size: 11px; color: var(--dim); }
.readout dd { margin: 0; white-space: nowrap; }
.readout b { display: inline-block; font-size: 15px; font-weight: 500; line-height: 1.25; font-variant-numeric: lining-nums tabular-nums; }
.stack b { font-size: 13px; }
.readout .u { color: var(--dim); font-size: 12px; margin-left: 0.35em; }
.readout .line { white-space: pre-wrap; font-variant-numeric: tabular-nums; }

footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 8px 14px 10px; }
.cap { display: flex; align-items: center; gap: 4px; padding: 3px; min-height: 36px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
.cap.playback { flex: 1 1 520px; flex-wrap: wrap; }
.cap .scrub { flex: 1 1 160px; min-width: 100px; width: auto; margin: 0 6px; }
.cap select { background: none; border-color: transparent; }
.cap select:hover { background: var(--raised); }
.frame, .fps { color: var(--dim); font-size: 12px; font-variant-numeric: lining-nums tabular-nums; white-space: nowrap; text-align: right; }
/* the rate reserves three digits as content, so that the dashes, 9 fps, and 120 fps take one width */
.fps { box-sizing: content-box; min-width: 7ch; padding: 0 6px 0 4px; }
.speed { font-variant-numeric: tabular-nums; }
.why { color: var(--dim); }
.disclose { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border: 0; border-radius: 6px;
  background: none; color: var(--fg); cursor: pointer; overflow: hidden; }
.disclose:hover { background: var(--raised); }
.disclose svg { width: 16px; height: 16px; }
.disclose .chev { width: 14px; height: 14px; color: var(--dim); transition: transform 0.15s; }
.disclose[aria-expanded="true"] { background: var(--accent-tint); box-shadow: inset 0 -2px var(--accent); }
.disclose[aria-expanded="true"] .chev { transform: rotate(180deg); }
.disclose:disabled { color: var(--dim); cursor: default; background: none; }
.disclose .xprog { position: absolute; left: 0; top: 0; height: 2px; width: 0; background: var(--accent); }
.exportbar { flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 4px 4px 4px 8px;
  background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
.exportbar .info { flex: 1 1 12em; color: var(--dim); font-variant-numeric: tabular-nums; }
.exportbar progress { width: 160px; accent-color: var(--accent); }
.status { position: absolute; inset: 0; display: grid; place-items: center; padding: 20px; color: var(--dim); white-space: pre-wrap; z-index: 5; }
.status.error { color: var(--error); }
`;function re(n,e,t){let i=document.createElement(n);return e!==void 0&&(i.className=e),t!==void 0&&(i.textContent=t),i}function dT(){let n=re("div","hint");for(let e of hT){let t=re("span","keys");t.append(...e.keys.map(r=>re("kbd",e.turn?"mark":void 0,r))),e.turn&&(t.prepend(wn("turnLeft")),t.append(wn("turnRight")));let i=re("div","g");i.append(t,re("span",void 0,e.does)),n.append(i)}return n}function si(n,e){n.textContent!==e&&(n.textContent=e)}var oi=n=>n.stopPropagation();function Ys(n,e,t,i="icon"){let r=re("button",i);return r.type="button",r.setAttribute("aria-label",e),r.title=t,r.appendChild(wn(n)),r.addEventListener("pointerdown",oi),r}function bf(n,e){let t=re("div",e===void 0?"cap":`cap ${e}`);return t.setAttribute("role","group"),t.setAttribute("aria-label",n),t}function $y(n,e,t){let i=re("div","seg");i.setAttribute("role","group"),t!==void 0&&i.setAttribute("aria-label",t);let r=new Map;for(let s of n){let o=re("button",void 0,s.label);o.type="button",o.setAttribute("aria-pressed","false"),o.addEventListener("pointerdown",oi),o.addEventListener("click",()=>e(s.id)),r.set(s.id,o),i.appendChild(o)}return{el:i,set(s){for(let[o,a]of r)a.setAttribute("aria-pressed",String(o===s))}}}function xf(n,e){n.value=String(e);let t=Number(n.max)-Number(n.min);n.style.setProperty("--p",`${t>0?100*(Number(n.value)-Number(n.min))/t:0}%`)}function jy(n,e){let t=re("div","chip"),i=re("span","body"),r=re("span","lbl",n);i.append(wn("grip","grip"),r),t.appendChild(i);let s=null,o=null;if(e==="menu")s=re("button","caret"),s.type="button",s.setAttribute("aria-haspopup","menu"),s.setAttribute("aria-expanded","false"),s.setAttribute("aria-label",`${n}: placement`),s.title="Add, split, or replace a panel",s.appendChild(wn("chevronDown")),s.addEventListener("pointerdown",oi),t.appendChild(s);else if(e==="select"){let a=re("span","caret");o=re("select"),a.append(wn("chevronDown"),o),a.addEventListener("pointerdown",oi),t.appendChild(a)}return{root:t,body:i,label:r,button:s,select:o}}function Xy(n,e){let t=zp(n),i=re("div",`readout ${e}`),r=re("div","line"),s=null,o=[];if(t!==null){s=re("dl");for(let a of t){let l=re("div"),c=re("dd"),h=re("b");a.width!==null&&(h.style.minWidth=`${a.width}ch`),c.appendChild(h),a.unit!==""&&c.appendChild(re("span","u",a.unit)),l.append(re("dt",void 0,a.label),c),s.appendChild(l),o.push(h)}i.appendChild(s),r.hidden=!0}return i.appendChild(r),{parts:n,tiles:t,root:i,list:s,values:o,line:r}}function qy(n,e){let t=Array.isArray(e);if(t&&n.tiles!==null&&n.list!==null&&e.length>0){n.list.hidden=!1,n.line.hidden=!0,n.tiles.forEach((i,r)=>si(n.values[r],e[i.part]??""));return}n.list!==null&&(n.list.hidden=!0),n.line.hidden=!1,si(n.line,t?e.join(""):e.error)}function fT(n,e){let t=n.kind==="panel";if(e==="centre")return t?"swap":"replace";let i={left:"left",right:"right",top:"above",bottom:"below"}[e];return`${t?"move":"split"} ${i}`}function pT(){return typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}var mT=typeof HTMLElement>"u"?class{}:HTMLElement,ba=class extends mT{static observedAttributes=["theme"];scene=null;sceneText="";geometry=null;store=null;renderer=null;theme=null;kiosk=!1;twin=null;minimal=!1;keepPanels=!1;loading=!1;loads=0;choice=null;root;header;titleEl;varsEl;addEl;panelArea;panelsEl;statusEl;statsEl;footer;canvas=null;paintCanvas=null;get heldProgress(){return this.heldValue!==null&&this.store!==null&&this.store.frame===this.heldFrame?this.heldValue:null}set heldProgress(e){this.heldValue=e,e!==null&&this.scene!==null&&(this.heldFrame=Math.min(this.scene.clock.frame_count-1,Math.floor(e*this.scene.clock.frame_count)))}heldValue=null;heldFrame=-1;stopAt=null;panelDom=new Map;gutterDom=new Map;gutters=[];sceneWidgets=[];captions=[];addChips=[];addButton=null;addGroup=null;playback=null;menu=null;closeExport=null;raf=0;hovered=null;intersecting=!0;shown=!1;viewObserver=null;onVisibility=()=>this.syncShown();dirty=!0;anchor={index:0,time:0};playProgress=null;speed=1;meter=new ol;panelAreaSize={w:0,h:0};saveTimer=0;resizeObserver=null;overlayObserver=null;onPageHide=()=>this.flushSave();unsubscribe=null;lastPanels=null;lastLayout=null;refreshExport=null;connectedCallback(){if(this.twin===null){if(this.shadowRoot===null&&this.buildShell(),this.scene!==null){this.applyTheme(),this.start();return}this.loading||(this.loading=!0,document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{this.loadFromSources()},{once:!0}):this.loadFromSources())}}disconnectedCallback(){this.stop()}attributeChangedCallback(){this.applyTheme()}buildShell(){this.kiosk=this.hasAttribute("kiosk")||this.twin==="kiosk",this.minimal=this.hasAttribute("minimal"),this.keepPanels=this.minimal&&(this.getAttribute("minimal")??"").split(/\s+/).includes("panels");let e=this.attachShadow({mode:"open"}),t=re("style");t.textContent=uT,e.appendChild(t),this.root=re("div",`root${this.kiosk?" kiosk":""}${this.twin==="picture"?" picture":""}${this.minimal?" minimal":""}${this.keepPanels?" keep-panels":""}`),this.header=re("header"),this.titleEl=re("h1"),this.varsEl=re("div","vars"),this.varsEl.setAttribute("role","group"),this.varsEl.setAttribute("aria-label","Scene"),this.addEl=re("div","add"),this.addEl.setAttribute("role","group"),this.addEl.setAttribute("aria-label","Add panel"),this.header.append(this.titleEl,this.varsEl,this.addEl),this.panelArea=re("div","panel-area"),this.panelsEl=re("div","panels"),this.statusEl=re("div","status","loading\u2026"),this.panelArea.append(this.panelsEl,this.statusEl),this.statsEl=re("div","stats"),this.footer=re("footer"),this.root.append(this.header,this.panelArea,this.statsEl,this.footer),e.appendChild(this.root),this.hasAttribute("tabindex")||(this.tabIndex=0),this.addEventListener("keydown",i=>this.onKey(i))}fail(e){this.statusEl.hidden=!1,this.statusEl.className="status error",this.statusEl.textContent=e}select(e){let t=this.getRootNode();try{return t.querySelector?.(e)??document.querySelector(e)}catch{return null}}source(e){for(let r of this.children)if(r.tagName==="SCRIPT"&&r.getAttribute("data-tycho")===e)return r;let t=this.getAttribute(e);if(!t)return this.select(`#tycho-${e}`);let i=this.select(t);if(i===null&&t.startsWith("#"))throw new Error(`the ${e} selector ${t} does not match an element`);return i??t}async read(e){if(typeof e!="string")return _a(e.textContent??"",e.getAttribute("data-encoding")??"base64");let t=await fetch(e);if(!t.ok)throw new Error(`${e} answered ${t.status}`);return new Uint8Array(await t.arrayBuffer())}async loadFromSources(){try{let e=this.source("scene"),t=this.source("data");if(e===null&&t===null){this.loading=!1;return}if(e===null||t===null)throw new Error(`the ${e===null?"scene":"data"} is missing`);let[i,r]=await Promise.all([this.read(e),this.read(t)]);if(this.loads>0)return;await this.load(new TextDecoder("utf-8").decode(i),r)}catch(e){this.fail(`the scene did not load: ${e.message}`)}}async load(e,t){this.shadowRoot===null&&this.buildShell();let i=++this.loads,r,s;try{if(r=JSON.parse(e),s=await qr.parse(t),i!==this.loads)return;for(let o of Va(r,s))console.warn(`TyCHO: ${o}`)}catch(o){if(i!==this.loads)return;this.stop(),this.fail(o instanceof Qt?o.message:`the scene cannot be read: ${o.message}`);return}this.stop(),this.scene=r,this.sceneText=e,this.geometry=new nl(r,s),this.store=new ya(this.recall(),r.clock.frame_count),this.choice=this.templateChoice(),this.statusEl.hidden=!0,this.applyTheme(),this.titleEl.textContent=r.title??"",this.buildTopBar(),this.buildFooter(),this.start(),(this.kiosk||this.hasAttribute("autoplay"))&&!pT()&&this.play()}start(){if(!(this.scene===null||this.store===null||this.renderer!==null||!this.isConnected)){this.canvas=re("canvas"),this.panelArea.insertBefore(this.canvas,this.panelsEl),this.paintCanvas=re("canvas","paint"),this.panelArea.insertBefore(this.paintCanvas,this.panelsEl);try{let e=this.twin===null?{}:{preserveDrawingBuffer:!0,coarseDrags:!1};this.renderer=new yh(this.canvas,this.scene,this.geometry,{theme:this.theme,...e})}catch(e){this.fail(`WebGL is not available: ${e.message}`);return}if(this.renderer.onChange=()=>this.invalidate(),this.unsubscribe=this.store.subscribe(e=>this.onChange(e)),this.measurePanelArea(),this.twin!==null){this.onChange("state");return}this.resizeObserver=new ResizeObserver(()=>{this.measurePanelArea(),this.layoutDom(),this.fitAddGroup(),this.invalidate()}),this.resizeObserver.observe(this.panelArea),this.resizeObserver.observe(this.header),this.overlayObserver=new ResizeObserver(e=>{let t=new Set(e.map(i=>i.target.closest(".panel")?.dataset.id));for(let i of t){let r=i===void 0?void 0:this.panelDom.get(i);r!==void 0&&this.measureOverlay(i,r)}this.invalidate()});for(let e of this.panelDom.values())this.observeOverlay(e);window.addEventListener("pagehide",this.onPageHide),document.addEventListener("visibilitychange",this.onVisibility),typeof IntersectionObserver<"u"&&(this.intersecting=!1,this.viewObserver=new IntersectionObserver(e=>{this.intersecting=e[e.length-1].isIntersecting,this.syncShown()},{threshold:0}),this.viewObserver.observe(this)),this.lastPanels=null,this.lastLayout=null;for(let e of[...this.panelDom.keys()])this.removePanelDom(e);this.onChange("state"),this.store.playing&&this.onChange("playing"),this.syncShown()}}stop(){cancelAnimationFrame(this.raf),this.raf=0,this.shown=!1,document.removeEventListener("visibilitychange",this.onVisibility),this.viewObserver?.disconnect(),this.viewObserver=null,this.flushSave(),this.closeMenu(!1),window.removeEventListener("pagehide",this.onPageHide),this.unsubscribe?.(),this.unsubscribe=null,this.resizeObserver?.disconnect(),this.resizeObserver=null,this.overlayObserver?.disconnect(),this.overlayObserver=null,this.renderer?.dispose(),this.renderer=null,this.canvas?.remove(),this.canvas=null,this.paintCanvas?.remove(),this.paintCanvas=null}hostProperty(e){return typeof getComputedStyle>"u"?"":getComputedStyle(this).getPropertyValue(e).trim()}applyTheme(){if(this.scene!==null){this.theme=ip(Ga(this.scene),this.getAttribute("theme"),e=>this.hostProperty(e));for(let[e,t]of Object.entries(rp(this.theme)))this.style.setProperty(e,t);this.renderer?.setTheme(this.theme),this.invalidate()}}recall(){let e=this.scene;if(this.kiosk)return structuredClone(e.initial);try{let t=localStorage.getItem(Eh(this.sceneText));return t===null?structuredClone(e.initial):Wy(e,JSON.parse(t))}catch{return structuredClone(e.initial)}}save(){this.kiosk||this.twin!==null||(window.clearTimeout(this.saveTimer),this.saveTimer=window.setTimeout(()=>this.flushSave(),300))}flushSave(){if(!(this.saveTimer===0||this.store===null)){window.clearTimeout(this.saveTimer),this.saveTimer=0;try{localStorage.setItem(Eh(this.sceneText),JSON.stringify(this.store.state))}catch{}}}reset(){if(!(this.scene===null||this.store===null)){try{localStorage.removeItem(Eh(this.sceneText))}catch{}this.closeMenu(!1),this.store.set(structuredClone(this.scene.initial));for(let e of this.panelDom.keys())this.renderer?.refit(e)}}get state(){return this.store?.state??null}onChange(e){let t=this.store;if(e==="state"){let i=t.state;i.panels!==this.lastPanels&&this.syncPanels(),(i.layout!==this.lastLayout||i.panels!==this.lastPanels)&&this.layoutDom(),this.lastPanels=i.panels,this.lastLayout=i.layout,this.syncWidgets(),this.save()}else if(e==="playing"){let i=this.playback;if(i!==null){let r=t.playing?"Pause (k)":"Play (k)";i.play.replaceChildren(wn(t.playing?"pause":"play")),i.play.setAttribute("aria-label",r),i.play.title=r,i.play.classList.toggle("on",t.playing)}if(this.meter.reset(),t.playing){let r=this.scene.clock,s=r.end==="stop"&&this.heldProgress!==null&&this.heldProgress>=1-2e-9;this.anchor={index:s?0:this.heldProgress===null?t.frame:this.heldProgress*r.frame_count,time:performance.now()},this.heldProgress=null}else this.playProgress!==null&&(this.heldProgress=this.playProgress);this.playProgress=null,t.playing||(this.stopAt=null),i!==null&&this.showRate(null)}this.invalidate()}invalidate(){this.dirty=!0,this.schedule()}schedule(){this.raf===0&&this.renderer!==null&&this.shown&&this.twin===null&&(this.raf=requestAnimationFrame(e=>this.tick(e)))}syncShown(){let e=this.intersecting&&!document.hidden;if(e!==this.shown){if(this.shown=e,!e){cancelAnimationFrame(this.raf),this.raf=0;return}this.store?.playing&&(this.meter.reset(),this.anchor={index:this.playPosition(),time:performance.now()}),this.invalidate()}}playPosition(){return this.playProgress===null?this.store.frame:this.playProgress*this.scene.clock.frame_count}tick(e){this.raf=0;let t=this.store,i=this.scene.clock;if(t.playing){let r=ll(this.anchor.index,e-this.anchor.time,1e3,i.frame_count,this.speed,Ct(i)),s=this.stopAt,o=i.end==="stop"?Math.floor(this.anchor.index/i.frame_count)*i.frame_count+i.frame_count*(1-1e-9):1/0,a=Math.min(s?.x??1/0,o);if(r>=a){r=a;let l=s!==null&&s.x<=o?s.index:null;t.setFrame(xo(r,i.frame_count)),this.playProgress=vo(r,i.frame_count),this.stopAt=null,this.pause(),l!==null&&this.reachStep(l)}else t.setFrame(xo(r,i.frame_count)),this.playProgress=vo(r,i.frame_count);this.dirty=!0}this.dirty&&(this.dirty=!1,this.draw(),t.playing&&this.countDraw(e)),t.playing&&this.schedule()}countDraw(e){this.meter.note(e),this.showRate(this.meter.report(e))}showRate(e){let t=this.playback;if(t===null)return;si(t.fps,_u(e));let i=Su(e);t.fps.title!==i&&(t.fps.title=i)}measurePanelArea(){this.panelAreaSize={w:this.panelArea.clientWidth,h:this.panelArea.clientHeight}}draw(e=Math.min(window.devicePixelRatio||1,2)){let t=this.renderer,i=this.store,r=this.scene;if(t===null)return;let s=i.state,{w:o,h:a}=this.panelAreaSize;if(o<1||a<1)return;let l=i.playing&&this.playProgress!==null?this.playProgress:this.heldProgress??i.frame/r.clock.frame_count,c=t.renderAt(s,l,o,a,e);this.paint(l,o,a,e),this.animatedLayout&&this.layoutDom(l);for(let[u,f]of this.panelDom){si(f.error,c.get(u)??"");let d=t.offKeys?.(u)??!1;f.follow.hidden===d&&(f.follow.hidden=!d);for(let p of f.readouts)qy(p,this.pieces(u,p.parts,l));f.barsFor!==s&&(this.syncBars(u,f),f.barsFor=s)}let h=this.firstPanel();for(let u of this.captions)qy(u,h===null?[]:this.pieces(h,u.parts,l));this.playback&&(xf(this.playback.scrub,i.frame),si(this.playback.frame,`${i.frame} / ${r.clock.frame_count}`))}get animatedLayout(){let e=t=>t.kind==="split"&&(t.keyframes!==void 0||e(t.a)||e(t.b));return this.store!==null&&e(this.store.state.layout)}paint(e,t,i,r){let s=this.paintCanvas,o=this.renderer;if(s===null||o===null||this.scene===null||this.theme===null)return;let a=Math.round(t*r),l=Math.round(i*r);(s.width!==a||s.height!==l)&&(s.width=a,s.height=l);let c=s.getContext("2d");c!==null&&(c.setTransform(1,0,0,1,0,0),c.clearRect(0,0,a,l),c.setTransform(r,0,0,r,0,0),cy(c,o,this.scene,this.store.state,this.theme,e,t,i,(h,u)=>{let f=this.pieces(h,u,e);return"error"in f?[]:f}))}pieces(e,t,i){try{let r={scene:this.scene,geometry:this.geometry,state:this.store.state,panel:e,frameIndex:this.store.frame,progress:i};return Bp(r,t)}catch(r){if(r instanceof Qt)return{error:r.message};throw r}}firstPanel(){let e=t=>t.kind==="panel"?t.id:e(t.a);return this.store===null?null:e(this.store.state.layout)}hasPlayback(){return(this.scene?.controls??[]).some(e=>e.kind==="playback")}get playing(){return this.store?.playing??!1}play(){this.store?.setPlaying(!0)}pause(){this.store?.setPlaying(!1)}step(e){let t=this.store;t!==null&&(this.pause(),this.heldProgress=null,t.setFrame(t.frame+e))}get steps(){return[...this.scene?.steps??[]]}get time(){return this.scene===null||this.store===null?0:(this.store.playing&&this.playProgress!==null?this.playProgress:this.heldProgress??this.store.frame/this.scene.clock.frame_count)*Ct(this.scene.clock)}get currentStep(){let e=this.time+1e-9,t=null;for(let i of this.steps)i.at<=e&&(t=i.id);return t}stepIndex(e){let t=this.steps,i=typeof e=="number"?e:t.findIndex(r=>r.id===e);if(!Number.isInteger(i)||i<0||i>=t.length)throw new Error(`the scene does not have a step ${JSON.stringify(e)}`);return i}seek(e){let t=this.scene,i=this.store;if(t===null||i===null||!Number.isFinite(e))return;let r=Ct(t.clock),s=Math.min(Math.max(e/r,0),1-1e-9);this.stopAt=null,this.pause(),this.heldProgress=s,this.playProgress=null,i.setFrame(Math.min(t.clock.frame_count-1,Math.floor(s*t.clock.frame_count))),this.invalidate()}goto(e){this.seek(this.steps[this.stepIndex(e)].at)}playTo(e){let t=this.scene,i=this.store;if(t===null||i===null)return;let r=this.stepIndex(e),s=Ct(t.clock),o=t.clock.frame_count,a=this.time,l=this.steps[r].at;if(Math.abs(l-a)<1e-9){this.reachStep(r);return}let c=(l>a?0:1)*o+Math.min(l/s*o,o*(1-1e-9));i.playing?this.anchor={index:this.playPosition(),time:performance.now()}:this.heldProgress??=i.frame/o,i.setPlaying(!0),this.stopAt={x:c,index:r}}next(){let e=this.time+1e-6,t=this.steps.findIndex(i=>i.at>e);return t<0?null:(this.playTo(t),this.steps[t].id)}previous(){let e=this.time-1e-6,t=-1;return this.steps.forEach((i,r)=>{i.at<e&&(t=r)}),t<0?null:(this.goto(t),this.steps[t].id)}reachStep(e){let t=this.steps[e];t!==void 0&&this.dispatchEvent(new CustomEvent("tycho-step",{detail:{id:t.id,index:e,at:t.at},bubbles:!0,composed:!0}))}seekFrame(e){let t=this.store;t.setFrame(e),this.playProgress=null,this.heldProgress=null,this.stopAt=null,t.playing&&(this.anchor={index:t.frame,time:performance.now()})}onKey(e){this.useKey(e)&&e.stopPropagation()}useKey(e){if(this.store===null||e.metaKey||e.ctrlKey||e.altKey)return!1;if(e.key==="Escape"){if(this.menu!==null)this.closeMenu(!0);else if(!this.closeExport?.())return!1;return e.preventDefault(),!0}let t=Hp(e.key,e.shiftKey,this.scene.clock.frame_count,e.code),i=e.composedPath()[0];if(i!==void 0&&["INPUT","SELECT","BUTTON","TEXTAREA"].includes(i.tagName)&&Vp(i.tagName,i.type,e.key))return!0;if(t===null)return!1;if(t.kind==="fit")return e.preventDefault(),this.fitAll(),!0;if(t.kind==="slider")return this.stepSlider(t.by)?(e.preventDefault(),!0):!1;if(t.kind==="view"||t.kind==="turn"){let r=this.renderer,s=r?.orbitPanels()??[],o=this.hovered!==null&&s.includes(this.hovered)?[this.hovered]:s;if(r===null||o.length===0)return!1;e.preventDefault();for(let a of o)t.kind==="view"?r.viewFrom(a,t.axis,t.sign):r.turnBy(a,t.degrees);return this.invalidate(),!0}return!this.hasPlayback()&&!this.kiosk?!1:(e.preventDefault(),t.kind==="toggle"?this.store.setPlaying(!this.store.playing):t.kind==="step"?this.step(t.by):this.seekFrame(t.frame),!0)}fitAll(){this.renderer?.refitAll(),this.invalidate()}fitPanel(e){this.renderer?.refit(e),this.invalidate()}stepSlider(e){let t=this.scene,i=this.store.state,r=this.firstPanel(),s=(t.controls??[]).find(h=>h.kind==="slider"&&ht(t,h.input)?.scope!=="per_panel");if(s===void 0||r===null)return!1;let o={scene:t,state:i,panel:i.panels[r]},a=al(o,this.geometry.sets,s);if(a.length===0)return!1;let l=this.panelValue(o,s.input),c=Math.min(a.length-1,Math.max(0,bo(a,l)+e));return this.store.update(h=>qs(t,h,s.input,a[c])),!0}buildFooter(){let e=this.scene;if(this.footer.replaceChildren(),this.playback=null,this.hasPlayback()){let s=bf("Playback","playback"),o=Ys("play","Play (k)","Play (k)","icon play");o.addEventListener("click",()=>this.store.setPlaying(!this.store.playing));let a=re("input","scrub");a.type="range",a.min="0",a.max=String(e.clock.frame_count-1),a.step="1",a.setAttribute("aria-label","Frame"),a.addEventListener("pointerdown",oi),a.addEventListener("input",()=>{this.pause(),this.store.setFrame(Number(a.value))});let l=re("span","frame");l.style.minWidth=`${2*String(e.clock.frame_count).length+3}ch`,l.title="Frame index of the loop. Left and right step, Home goes to 0";let c=re("select","speed");c.setAttribute("aria-label","Playback speed"),c.title="Playback speed";for(let f of cT){let d=re("option",void 0,`${f}\xD7`);d.value=String(f),d.selected=f===this.speed,c.appendChild(d)}c.addEventListener("change",()=>{this.speed=Number(c.value),this.anchor={index:this.playPosition(),time:performance.now()},this.refreshExport?.()}),s.append(o,a,l,c);let h=null;e.clock.channels.length>1&&(h=$y(e.clock.channels.map((f,d)=>({id:f,label:e.clock.labels?.[d]??f})),f=>this.store.update(d=>zy(d,f)),"Clock"),h.el.title="What the frame index runs along",s.append(h.el));let u=re("span","fps",_u(null));u.title=Su(null),s.append(u),this.footer.append(s),this.playback={play:o,scrub:a,frame:l,fps:u,channel:h}}let t=bf("View","view"),i=Ys("house","Reset every view","Reset every view: return each panel to its timeline's camera, or fit it to what it draws (F)");i.addEventListener("click",()=>this.fitAll());let r=Ys("rotateCcw","Reset scene","Reset scene: panels, layout, and controls as written");r.addEventListener("click",()=>this.reset()),t.append(i,r),this.footer.append(t),this.buildExport()}exportVideo(e={}){if(this.scene===null||this.store===null||this.geometry===null)return Promise.reject(new Error("the viewer has not loaded a scene"));let t=e.kiosk??this.kiosk,r={clock:this.scene.clock,panelArea:this.pictureSize(t),open:(s,o,a)=>this.openTwin(t?"kiosk":"picture",s,o,a)};return Jp(r,{speed:this.speed,...e})}pictureSize(e){if(e)return{w:this.clientWidth,h:this.clientHeight};let t=this.kiosk?0:this.statsEl.offsetHeight;return{w:this.panelArea.clientWidth,h:this.panelArea.clientHeight+t}}async openTwin(e,t,i,r){let s=document.createElement(this.localName);s.twin=e;let o=this.getAttribute("theme");o!==null&&s.setAttribute("theme",o),s.style.cssText=`position: absolute; left: 0; top: 0; width: ${t}px; height: ${i}px; min-height: 0; visibility: hidden; pointer-events: none;`,s.tabIndex=-1,s.setAttribute("aria-hidden","true"),s.buildShell(),s.scene=this.scene,s.sceneText=this.sceneText,s.geometry=this.geometry,s.store=new ya(structuredClone(this.store.state),this.scene.clock.frame_count),s.choice=s.templateChoice(),s.statusEl.hidden=!0,s.titleEl.textContent=this.scene.title??"",this.root.appendChild(s);try{if(s.applyTheme(),s.buildTopBar(),s.buildFooter(),s.start(),s.renderer===null)throw new Error(s.statusEl.textContent??"the export cannot draw the panel area");s.drawAt(0,0,r),await s.renderer.ready(),await document.fonts?.ready}catch(a){throw s.stop(),s.remove(),a}return{draw:(a,l,c)=>{s.drawAt(l,c,r),Oy(a,s)},close:()=>{s.stop(),s.remove()}}}drawAt(e,t,i){this.store.setFrame(e),this.heldValue=t,this.heldFrame=e,this.measurePanelArea(),this.layoutDom(t);for(let[r,s]of this.panelDom)this.measureOverlay(r,s);this.draw(i)}buildExport(){let e=bf("Export","export"),t=re("button","disclose");t.type="button",t.append(wn("download"),re("span",void 0,"Export video"),wn("chevronDown","chev"));let i=re("div","exportbar");e.appendChild(t),this.footer.appendChild(e),this.closeExport=null;let r=Eu();if(r!==null){t.disabled=!0,this.footer.append(re("span","why",`video export is unavailable: ${r}`));return}let s=re("span","xprog");s.hidden=!0,t.appendChild(s),i.id="xbar",i.setAttribute("role","group"),i.setAttribute("aria-label","Export options"),i.hidden=!0,t.setAttribute("aria-expanded","false"),t.setAttribute("aria-controls","xbar");let o=x=>{i.hidden=!x,t.setAttribute("aria-expanded",String(x)),x&&(b(),_())};this.closeExport=()=>i.hidden?!1:(o(!1),t.focus(),!0),t.addEventListener("click",()=>o(i.hidden!==!1));let a=(x,M)=>{let E=re("select");E.setAttribute("aria-label",x),E.title=x;for(let[v,A]of M){let L=re("option",void 0,A);L.value=v,E.appendChild(L)}return E},l=a("Size",[["720p","1280\xD7720"],["1080p","1920\xD71080"],["panels","size of the panels"]]),c=a("Frame rate",cl.map(x=>[String(x),`${x} fps`]));c.value="30";let h=()=>_o("panels",this.pictureSize(this.kiosk),window.devicePixelRatio||1,Number(c.value)),u=a("Loops",$p.map(x=>[String(x),x===1?"1 loop":`${x} loops`])),f=re("span","info"),d=re("button","btn primary","Start");d.type="button";let p=re("progress");p.hidden=!0;let y=re("button","btn","Cancel");y.type="button",y.hidden=!0;let m=Ys("x","Close export options","Close (Esc)");m.addEventListener("click",()=>{o(!1),t.focus()});let g=null,b=()=>{if(g!==null)return;let x=this.scene.clock;u.value="1",c.value=String(jp(x.frame_count,this.speed,Ct(x))??cl[0])},_=()=>{if(g!==null)return;let x=l.options[2],M=h();x.textContent=`panels, ${M.width}\xD7${M.height}`;let E=this.scene.clock,v=hl(E.frame_count,Number(c.value),Number(u.value),this.speed,0,Ct(E)),A=ul(v.count,Number(c.value));f.textContent=A??`${v.count} frames, ${v.duration.toFixed(1)} s at ${this.speed}\xD7 speed`,d.disabled=A!==null};for(let x of[l,c,u])x.addEventListener("change",_);this.refreshExport=()=>{i.hidden||(b(),_())},d.addEventListener("click",()=>{let x=new AbortController;g=x,d.disabled=!0,y.hidden=!1,p.hidden=!1,p.value=0,s.hidden=!1,s.style.width="0%";let M=l.value,E=`${(this.scene.title??"tycho").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"tycho"}.mp4`,v="";this.exportVideo({size:M,fps:Number(c.value),loops:Number(u.value),signal:x.signal,onConfig:A=>v=`${A.width}\xD7${A.height} H.264 ${A.codec}`,onProgress:(A,L)=>{p.max=L,p.value=A,s.style.width=`${L>0?100*A/L:0}%`,f.textContent=`${v}, frame ${A} of ${L}`}}).then(A=>{let L=URL.createObjectURL(A),C=re("a");C.href=L,C.download=E,this.shadowRoot.appendChild(C),C.click(),C.remove(),window.setTimeout(()=>URL.revokeObjectURL(L),6e4),f.textContent=`saved ${E}, ${v}, ${(A.size/1e6).toFixed(2)} MB`}).catch(A=>{f.textContent=A instanceof DOMException&&A.name==="AbortError"?"canceled":`export failed: ${A.message}`}).finally(()=>{g=null,d.disabled=!1,y.hidden=!0,p.hidden=!0,s.hidden=!0})}),y.addEventListener("click",()=>g?.abort()),i.append(l,c,u,f,d,p,y,m),this.footer.append(i)}makeWidget(e,t){let i=this.scene,r=ht(i,e.input);if(r===void 0)return null;let s=l=>this.store.update(c=>qs(i,c,e.input,l,t)),o=l=>{let c=r.scope==="per_panel"?l.panel.inputs:l.state.inputs;return c!==void 0&&Object.hasOwn(c,e.input)?c[e.input]:r.default},a=()=>{let l=re("label","field");return l.appendChild(re("span","k",e.label)),l.addEventListener("pointerdown",oi),l};if(e.kind==="tabs"&&r.kind==="choice"&&t!==void 0&&r.values.length>3){let l=r,c=re("select");l.values.forEach((u,f)=>{let d=re("option",void 0,l.labels?.[f]??u);d.value=u,c.appendChild(d)}),c.addEventListener("change",()=>s(c.value));let h=a();return h.appendChild(c),{el:h,sync:u=>{c.value=String(o(u))}}}if(e.kind==="tabs"&&r.kind==="choice"){let l=r,c=$y(l.values.map((u,f)=>({id:u,label:l.labels?.[f]??u})),u=>s(u),e.label),h=re("span","field");return h.append(re("span","k",e.label),c.el),h.addEventListener("pointerdown",oi),{el:h,sync:u=>c.set(String(o(u)))}}if(e.kind==="toggle"&&r.kind==="toggle"){let l=re("input");l.type="checkbox",l.addEventListener("change",()=>s(l.checked));let c=a();return c.prepend(l),{el:c,sync:h=>{l.checked=o(h)===!0}}}if(e.kind==="slider"&&r.kind==="parameter"){let l=re("input");l.type="range",l.min="0",l.step="1";let c=re("output"),h=[];l.addEventListener("input",()=>{xf(l,Number(l.value));let f=h[Number(l.value)];f!==void 0&&s(f)});let u=a();return u.append(l,c),{el:u,sync:f=>{h=al(f,this.geometry.sets,e),l.disabled=h.length===0,l.max=String(Math.max(0,h.length-1));let d=o(f);xf(l,Math.max(0,bo(h,d))),c.textContent=Yi(d)}}}return null}templateChoice(){let e=this.scene,t=Object.entries(e.inputs??{}).filter(([,a])=>a?.kind==="choice"&&a.scope==="per_panel");if(t.length===0)return null;let i=new Set(Object.values(e.panels).map(a=>typeof a.frame=="string"?"":a.frame.input)),[r,s]=t.find(([a])=>i.has(a))??t[0],o=(e.controls??[]).find(a=>a.kind==="tabs"&&a.input===r);return{id:r,def:s,label:o?.label??r}}templates(){return Object.entries(this.scene.panels).map(([e,t])=>({kind:"declared",panel:e,label:t.label??e}))}buildTopBar(){let e=this.scene;this.varsEl.replaceChildren(),this.sceneWidgets=[];for(let t of e.controls??[]){if(t.kind==="playback"||ht(e,t.input)?.scope==="per_panel")continue;let i=this.makeWidget(t,void 0);i&&(this.sceneWidgets.push(i),this.varsEl.appendChild(i.el))}this.buildAddGroup(),this.statsEl.replaceChildren(),this.captions=(e.readouts??[]).filter(t=>t.place==="caption").map(t=>Xy(t.parts,"wide")),this.statsEl.append(...this.captions.map(t=>t.root))}buildAddGroup(){this.addEl.replaceChildren();let e=this.templates(),t=re("div","chips");t.appendChild(re("span","k","Add panel")),this.addChips=[];for(let r of e){let s=jy(r.label,"menu");s.body.setAttribute("role","button"),s.body.tabIndex=0,s.body.setAttribute("aria-roledescription","draggable"),s.body.title="Drag onto a panel: an edge splits it, the center replaces it. Click to add a panel.",s.body.addEventListener("pointerdown",a=>this.startDrag(a,r,s.body,s.root)),s.body.addEventListener("keydown",a=>{a.key!=="Enter"&&a.key!==" "||(a.preventDefault(),a.stopPropagation(),this.addPanel(r))});let o=s.button;o.addEventListener("click",()=>this.openMenu(o,this.chipEntries(r))),t.appendChild(s.root),this.addChips.push(s.root)}let i=re("button","btn");i.type="button",i.setAttribute("aria-haspopup","menu"),i.setAttribute("aria-expanded","false"),i.append(wn("plus"),re("span",void 0,"Add panel"),wn("chevronDown","chev")),i.hidden=!0,i.addEventListener("pointerdown",oi),i.addEventListener("click",()=>this.openMenu(i,e.map(r=>({label:r.label,run:()=>this.addPanel(r)})))),this.addEl.append(t,i),this.addGroup=t,this.addButton=i,this.fitAddGroup()}fitAddGroup(){let e=this.addGroup,t=this.addButton;if(e===null||t===null||this.addChips.length<2)return;let i=this.shadowRoot?.activeElement??null;e.hidden=!1,t.hidden=!0;let r=this.addChips[0],o=this.addChips[this.addChips.length-1].offsetTop>r.offsetTop+r.offsetHeight/2;e.hidden=o,t.hidden=!o,o&&i!==null&&e.contains(i)&&t.focus()}chipEntries(e){let t=this.scene;return Vy(this.store.state,i=>this.panelName(i),Th).map(i=>({label:i.label,disabled:i.disabled,group:i.group,run:()=>this.store.update(r=>Gy(t,r,i.placement,e,Th,s=>this.isTall(s)))}))}addPanel(e){this.store.update(t=>yf(this.scene,t,e,Th,i=>this.isTall(i)))}isTall(e){let t=this.panelDom.get(e)?.host.getBoundingClientRect();return t!==void 0&&t.width<t.height}panelName(e){let t=this.panelDom.get(e);if(t===void 0)return e;let i=t.chipLabel.textContent??"";return t.title.hidden?i||e:`${t.title.textContent??e}, ${i}`}openMenu(e,t){let i=this.menu?.anchor===e;if(this.closeMenu(!1),i)return;let r=re("div","menu");r.setAttribute("role","menu");let s=[];for(let h of t){if(h.group&&s.length>0){let f=re("hr");f.setAttribute("role","separator"),r.appendChild(f)}let u=re("button",void 0,h.label);u.type="button",u.setAttribute("role","menuitem"),u.tabIndex=-1,u.disabled=h.disabled===!0,u.addEventListener("click",()=>{this.closeMenu(!0),h.run()}),r.appendChild(u),s.push(u)}let o=s.filter(h=>!h.disabled);r.addEventListener("pointerdown",oi),r.addEventListener("keydown",h=>{let u=o.indexOf(this.shadowRoot.activeElement),f=o.length,d=p=>o[(p%f+f)%f]?.focus();if(h.key==="ArrowDown")d(u+1);else if(h.key==="ArrowUp")d(u-1);else if(h.key==="Home")d(0);else if(h.key==="End")d(f-1);else if(h.key==="Escape")this.closeMenu(!0);else if(h.key==="Tab")this.closeMenu(!1);else return;h.key!=="Tab"&&h.preventDefault(),h.stopPropagation()}),this.root.appendChild(r);let a=e.getBoundingClientRect(),l=a.bottom+4+r.offsetHeight<=window.innerHeight;r.style.left=`${Math.max(4,Math.min(a.left,window.innerWidth-r.offsetWidth-4))}px`,r.style.top=`${l?a.bottom+4:Math.max(4,a.top-r.offsetHeight-4)}px`,e.setAttribute("aria-expanded","true");let c=h=>{let u=h.composedPath();!u.includes(r)&&!u.includes(e)&&this.closeMenu(!1)};window.addEventListener("pointerdown",c,!0),this.menu={anchor:e,close:h=>{r.remove(),e.setAttribute("aria-expanded","false"),window.removeEventListener("pointerdown",c,!0),h&&e.focus()}},o[0]?.focus()}closeMenu(e){let t=this.menu;this.menu=null,t?.close(e)}syncWidgets(){let e=this.store,t=this.scene,i=e.state,r=this.firstPanel();if(r!==null){let a={scene:t,state:i,panel:i.panels[r]};for(let l of this.sceneWidgets)l.sync(a)}let s=Object.keys(t.panels).length,o=this.choice;for(let[a,l]of this.panelDom){let c=i.panels[a];if(c===void 0)continue;let h={scene:t,state:i,panel:c};for(let g of l.widgets)g.sync(h);let u=t.panels[c.panel],f=typeof u.frame=="string"?u.frame:String(this.panelValue(h,u.frame.input)),p=(Object.hasOwn(t.frames,f)?t.frames[f]:void 0)?.label??f;l.title.textContent=u.label??c.panel,l.title.hidden=s<2||l.title.textContent===p;let y=u.frame,m=typeof y=="string"?null:y.input;if(o!==null&&l.select!==null){let g=String(this.panelValue(h,o.id));l.select.value=g,si(l.chipLabel,o.def.labels?.[o.def.values.indexOf(g)]??g),l.meta.textContent=p,l.meta.hidden=m===o.id||m!==null&&(t.controls??[]).some(b=>b.kind!=="playback"&&b.input===m&&ht(t,m)?.scope==="per_panel")}else si(l.chipLabel,p),l.meta.hidden=!0;l.close.hidden=Object.keys(i.panels).length<2}this.playback?.channel?.set(i.clock.channel)}panelValue(e,t){let i=ht(e.scene,t);if(i===void 0)return"";let r=i.scope==="per_panel"?e.panel.inputs:e.state.inputs;return r!==void 0&&Object.hasOwn(r,t)?r[t]:i.default}syncPanels(){let e=this.store.state;for(let t of[...this.panelDom.keys()])Object.hasOwn(e.panels,t)||this.removePanelDom(t);for(let t of Object.keys(e.panels)){let i=this.panelDom.get(t);i!==void 0&&i.panel===e.panels[t].panel||(i!==void 0&&this.removePanelDom(t),this.createPanelDom(t,e.panels[t]))}}createPanelDom(e,t){let i=this.scene,r=re("div","panel");r.dataset.id=e;let s=re("div","pbody"),o=(i.readouts??[]).filter(E=>E.place==="panel").map(E=>Xy(E.parts,"stack")),a=re("div","preadout");a.append(...o.map(E=>E.root));let l=re("div","perror"),c=re("div","cbars"),h=re("div","drop"),u=re("span");h.appendChild(u),h.hidden=!0;let f=re("button","btn follow");f.type="button",f.append(wn("house"),re("span",void 0,"Timeline view")),f.title="Back to the timeline's camera (F returns every panel)",f.hidden=!0,f.addEventListener("pointerdown",oi),f.addEventListener("click",()=>this.fitPanel(e)),s.append(a,l,c,h,f),i.panels[t.panel]?.camera?.kind==="3d"&&s.append(dT()),s.addEventListener("pointerenter",()=>this.hovered=e),s.addEventListener("pointerleave",()=>{this.hovered===e&&(this.hovered=null)}),s.addEventListener("dblclick",()=>this.fitPanel(e));let d=re("div","pheader"),p=re("span","t"),y=this.choice,m=jy("",y===null?"none":"select");if(m.body.title="Drag to move the panel: onto an edge of another to place it there, onto its center to swap",y!==null&&m.select!==null){let E=m.select;E.setAttribute("aria-label",y.label),y.def.values.forEach((v,A)=>{let L=re("option",void 0,y.def.labels?.[A]??v);L.value=v,E.appendChild(L)}),E.addEventListener("change",()=>this.store.update(v=>qs(i,v,y.id,E.value,e)))}let g=re("span","m"),b=re("span","pc mini"),_=[];for(let E of i.controls??[]){if(E.kind==="playback"||ht(i,E.input)?.scope!=="per_panel"||y!==null&&E.kind==="tabs"&&E.input===y.id)continue;let v=this.makeWidget(E,e);v&&(_.push(v),b.appendChild(v.el))}let x=Ys("house","Reset view","Reset view: fit to what this panel draws (F resets every panel)");x.addEventListener("click",()=>this.fitPanel(e));let M=Ys("x","Close panel","Close panel");M.addEventListener("click",()=>this.store.update(E=>Hy(E,e))),d.append(p,m.root,g,b,re("span","sp"),x,M),d.addEventListener("pointerdown",E=>this.startDrag(E,{kind:"panel",id:e},d,m.root)),r.append(s,d),this.panelsEl.appendChild(r),this.panelDom.set(e,{host:r,body:s,header:d,title:p,chip:m.root,chipLabel:m.label,select:m.select,meta:g,close:M,readouts:o,error:l,follow:f,drop:h,dropLabel:u,bars:c,barDom:[],barsFor:null,widgets:_,panel:t.panel}),this.renderer?.bind(e,s),this.observeOverlay(this.panelDom.get(e))}observeOverlay(e){this.overlayObserver?.observe(e.header),this.overlayObserver?.observe(e.bars)}measureOverlay(e,t){let i=t.header.offsetHeight,r=`${i}px`;t.host.style.getPropertyValue("--header-height")!==r&&t.host.style.setProperty("--header-height",r);let s=t.bars;s.classList.toggle("tight",s.clientHeight<lT);let o=0;for(let c of s.children)o=Math.max(o,c.offsetHeight);let a=s.offsetWidth,l=t.body.clientWidth-s.offsetLeft-a;this.renderer?.setClearance(e,{header:i,bars:o>0&&a>0?{right:l,top:s.offsetTop,width:a,height:o}:null})}removePanelDom(e){let t=this.panelDom.get(e);t&&(this.renderer?.bind(e,null),this.overlayObserver?.unobserve(t.header),this.overlayObserver?.unobserve(t.bars),t.host.remove(),this.panelDom.delete(e))}layoutDom(e){if(this.store===null)return;let{w:t,h:i}=this.panelAreaSize,r=e??this.heldProgress??this.store.frame/this.scene.clock.frame_count,s=dh(ma(this.store.state.layout,r*Ct(this.scene.clock)),{x:0,y:0,w:t,h:i},bh);for(let[a,l]of s.panels){let c=this.panelDom.get(a);c&&Object.assign(c.host.style,{left:`${l.x}px`,top:`${l.y}px`,width:`${l.w}px`,height:`${l.h}px`})}this.gutters=s.gutters;let o=new Set;for(let a of s.gutters){o.add(a.path);let l=this.gutterDom.get(a.path);if(!l){l=re("div","gutter");let c=a.path;l.addEventListener("pointerdown",h=>this.startResize(h,c,l)),this.gutterDom.set(a.path,l),this.panelsEl.appendChild(l)}l.className=`gutter ${a.dir}`,Object.assign(l.style,{left:`${a.rect.x}px`,top:`${a.rect.y}px`,width:`${a.rect.w}px`,height:`${a.rect.h}px`})}for(let[a,l]of[...this.gutterDom])o.has(a)||(l.remove(),this.gutterDom.delete(a))}startResize(e,t,i){let r=this.gutters.find(a=>a.path===t);if(!r||e.button!==0)return;e.preventDefault(),i.classList.add("active"),i.setPointerCapture(e.pointerId);let s=a=>{let l=this.panelArea.getBoundingClientRect(),c=dy(r,a.clientX-l.left,a.clientY-l.top,bh);this.store.update(h=>ga(h,uh(h.layout,t,c)))},o=()=>{i.classList.remove("active"),i.removeEventListener("pointermove",s),i.removeEventListener("pointerup",o),i.removeEventListener("pointercancel",o)};i.addEventListener("pointermove",s),i.addEventListener("pointerup",o),i.addEventListener("pointercancel",o)}syncBars(e,t){let i=this.scene,r=this.renderer.colorbars(e);t.barDom.length!==r.length&&(t.barDom=r.map(()=>this.makeBar(e)),t.bars.replaceChildren(...t.barDom.map(a=>a.root)));let s=this.store.state.panels[e],o=s===void 0?void 0:i.panels[s.panel];r.forEach((a,l)=>{let c=t.barDom[l];si(c.title,a.label),c.gradient!==a.gradient&&(c.gradient=a.gradient,c.grad.style.background=a.gradient);let h=Number.isInteger(a.lo)&&Number.isInteger(a.hi)?void 0:3;si(c.hi,Yi(a.hi,h)),si(c.lo,Yi(a.lo,h)),c.range=[a.lo,a.hi],c.mark.hidden=a.marker===null,a.marker!==null&&(c.mark.style.bottom=`${(100*a.marker).toFixed(2)}%`),c.band.hidden=a.band===null,a.band!==null&&(c.band.style.bottom=`${(100*a.band[0]).toFixed(2)}%`,c.band.style.height=`${(100*(a.band[1]-a.band[0])).toFixed(2)}%`),c.link=o===void 0?null:Gp(i,o,a.label);let u=c.grad;if(u.classList.toggle("live",c.link!==null),c.link===null){for(let d of["role","tabindex","aria-orientation","aria-label","aria-valuemin","aria-valuemax","aria-valuenow","aria-valuetext","title"])u.removeAttribute(d);return}let f=this.panelValue({scene:i,state:this.store.state,panel:s},c.link.input);u.setAttribute("role","slider"),u.setAttribute("tabindex","0"),u.setAttribute("aria-orientation","vertical"),u.setAttribute("aria-label",c.link.label),u.setAttribute("aria-valuemin",String(a.lo)),u.setAttribute("aria-valuemax",String(a.hi)),u.setAttribute("aria-valuenow",String(f)),u.setAttribute("aria-valuetext",Yi(f)),u.title=`Drag or click to set ${c.link.label}`})}makeBar(e){let t=re("div","cbar"),i=re("div","cbar-t"),r=re("div","cbar-b"),s=re("div","cbar-g"),o=re("span","cbar-k"),a=re("i");s.append(o,a);let l=re("div","cbar-n"),c=re("span"),h=re("span");l.append(c,h),r.append(s,l),t.append(i,r);let u={root:t,title:i,grad:s,band:o,mark:a,hi:c,lo:h,gradient:"",range:[0,1],link:null};return s.addEventListener("pointerdown",f=>{if(u.link===null||f.button!==0)return;f.preventDefault(),f.stopPropagation(),s.focus(),s.setPointerCapture(f.pointerId);let d=y=>{let m=s.getBoundingClientRect();this.setFromBar(e,u,m.height>0?(m.bottom-y.clientY)/m.height:0)},p=()=>{s.removeEventListener("pointermove",d),s.removeEventListener("pointerup",p),s.removeEventListener("pointercancel",p)};d(f),s.addEventListener("pointermove",d),s.addEventListener("pointerup",p),s.addEventListener("pointercancel",p)}),s.addEventListener("dblclick",oi),s.addEventListener("keydown",f=>{if(u.link===null)return;let d={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1,PageUp:10,PageDown:-10,Home:-1/0,End:1/0};f.key in d&&(f.preventDefault(),f.stopPropagation(),this.stepBar(e,u,d[f.key]))}),u}barStops(e,t){let i=this.store.state,r=i.panels[e];if(r===void 0)return[];let s={kind:"slider",input:t.input,label:t.label,domain:t.domain};return al({scene:this.scene,state:i,panel:r},this.geometry.sets,s)}setFromBar(e,t,i){if(t.link===null)return;let r=this.barStops(e,t.link),s=Wp(r,t.range[0],t.range[1],i),o=t.link.input;s>=0&&this.store.update(a=>qs(this.scene,a,o,r[s]))}stepBar(e,t,i){if(t.link===null)return;let r=this.barStops(e,t.link),s=this.store.state;if(r.length===0||s.panels[e]===void 0)return;let o=this.panelValue({scene:this.scene,state:s,panel:s.panels[e]},t.link.input),a=Math.min(r.length-1,Math.max(0,bo(r,o)+i)),l=t.link.input;this.store.update(c=>qs(this.scene,c,l,r[a]))}startDrag(e,t,i,r){if(e.button!==0||this.store===null)return;e.preventDefault(),this.closeMenu(!1);let s=e.clientX,o=e.clientY,a=this.shadowRoot,l=null,c=null;i.setPointerCapture(e.pointerId);let h=()=>{for(let d of this.panelDom.values())d.drop.hidden=!0},u=d=>{if(!l){if(Math.hypot(d.clientX-s,d.clientY-o)<4)return;l=r.cloneNode(!0),l.classList.add("ghost"),this.root.appendChild(l),r.classList.add("source"),this.root.classList.add("dragging")}l.style.left=`${d.clientX}px`,l.style.top=`${d.clientY}px`,h(),c=null;let y=a.elementFromPoint(d.clientX,d.clientY)?.closest(".panel");if(!y)return;let m=y.dataset.id;if(t.kind==="panel"&&t.id===m)return;let g=this.panelDom.get(m);if(!g)return;let b=g.host.getBoundingClientRect(),_=Qp(d.clientX-b.left,d.clientY-b.top,b.width,b.height);c={id:m,zone:_},g.drop.hidden=!1,g.drop.style.inset=_==="left"?"0 50% 0 0":_==="right"?"0 0 0 50%":_==="top"?"0 0 50% 0":_==="bottom"?"50% 0 0 0":"0",si(g.dropLabel,fT(t,_))},f=d=>{i.removeEventListener("pointermove",u),i.removeEventListener("pointerup",f),i.removeEventListener("pointercancel",f),h();let p=l!==null;if(l?.remove(),r.classList.remove("source"),this.root.classList.remove("dragging"),!p){t.kind!=="panel"&&d.type==="pointerup"&&this.addPanel(t);return}c&&this.dropOn(c.id,c.zone,t)};i.addEventListener("pointermove",u),i.addEventListener("pointerup",f),i.addEventListener("pointercancel",f)}dropOn(e,t,i){let r=this.scene;this.store.update(s=>wh(r,s,e,t,i,Th))}};function Ah(n="tycho-viewer"){typeof customElements<"u"&&!customElements.get(n)&&customElements.define(n,ba)}function gT(n,e){return n.exportVideo(e)}Ah();return s0(yT);})();
/**
 * @license Lucide, https://lucide.dev, ISC License
 *
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
 * All other copyright (c) for Lucide are held by Lucide Contributors 2022.
 *
 * Permission to use, copy, modify, and/or distribute this software for any purpose with or
 * without fee is hereby granted, provided that the above copyright notice and this permission
 * notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
 * SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
 * AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
 * NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE
 * OF THIS SOFTWARE.
 */
/*! Bundled license information:

three/build/three.core.js:
three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2026 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
