/*! TyCHO runtime 0.2.0, Apache-2.0, https://github.com/beeson-group/tycho
 * This bundle contains:
 * mp4-muxer 5.2.2, MIT, Copyright 2023 Vanilagy, https://github.com/Vanilagy/mp4-muxer
 * three 0.180.0, MIT, Copyright 2010-2025 three.js authors, https://github.com/mrdoob/three.js
 * Full license texts: https://github.com/beeson-group/tycho/blob/main/THIRD_PARTY_NOTICES.md */
"use strict";var tycho=(()=>{var Cc=Object.defineProperty;var $m=Object.getOwnPropertyDescriptor;var Xm=Object.getOwnPropertyNames;var qm=Object.prototype.hasOwnProperty;var Ym=(n,e)=>{for(var t in e)Cc(n,t,{get:e[t],enumerable:!0})},jm=(n,e,t,i)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of Xm(e))!qm.call(n,r)&&r!==t&&Cc(n,r,{get:()=>e[r],enumerable:!(i=$m(e,r))||i.enumerable});return n};var Jm=n=>jm(Cc({},"__esModule",{value:!0}),n);var bw={};Ym(bw,{Container:()=>Er,DATA_VERSION:()=>wr,EXPORT_LIMITS:()=>_s,SCENE_MAJOR:()=>$i,SCENE_MINOR:()=>As,TychoError:()=>nn,TychoViewerElement:()=>Pa,colormap:()=>ji,colormapCss:()=>fd,decodeEmbedded:()=>Da,define:()=>Ec,evaluate:()=>dd,exportVideo:()=>xw,formatNumber:()=>sn,sizePreset:()=>Ta,validate:()=>$a});var nn=class extends Error{rule;constructor(e,t){super(`[${e}] ${t}`),this.name="TychoError",this.rule=e}};function R(n,e){throw new nn(n,e)}var wr=1,Zm=[84,89,67,68],Es=12,Ju={raw:new Set(["dtype","shape","encoding","offset","length"]),"shuffle-delta-deflate":new Set(["dtype","shape","encoding","chunk_rows","chunks"])},Tr={int8:Int8Array,uint8:Uint8Array,int16:Int16Array,uint16:Uint16Array,int32:Int32Array,uint32:Uint32Array,float32:Float32Array,float64:Float64Array},Zu=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;function Km(n){return typeof n=="string"&&Object.hasOwn(Tr,n)}function Mr(n){return Tr[n].BYTES_PER_ELEMENT}var Ts=n=>Number.isSafeInteger(n)&&n>=0,Rc=n=>n!==null&&typeof n=="object"&&!Array.isArray(n);function Qm(n,e,t,i){let r=new Tr[i](t),s=Mr(i),a={int8:o=>n.getInt8(o),uint8:o=>n.getUint8(o),int16:o=>n.getInt16(o,!0),uint16:o=>n.getUint16(o,!0),int32:o=>n.getInt32(o,!0),uint32:o=>n.getUint32(o,!0),float32:o=>n.getFloat32(o,!0),float64:o=>n.getFloat64(o,!0)}[i];for(let o=0;o<t;o++)r[o]=a(e+o*s);return r}async function eg(n,e,t){let i=e.length,r=new DecompressionStream("deflate"),s=r.writable.getWriter();s.write(n).catch(()=>{}),s.close().catch(()=>{});let a=r.readable.getReader(),o=0;try{for(;;){let{done:l,value:c}=await a.read();if(l)break;o+c.length>i&&(a.cancel().catch(()=>{}),R("D5",`${t} inflates to more than the ${i} bytes of its rows`)),e.set(c,o),o+=c.length}}catch(l){if(l instanceof nn)throw l;let c=l.message;R("D5",`${t} does not inflate${c?`: ${c}`:""}`)}o!==i&&R("D5",`${t} inflates to ${o} bytes, not the ${i} of its rows`)}function tg(n,e,t,i,r,s){let a=e*t;if(i===1){let o=new Uint8Array(r,s,a);o.set(n.subarray(0,Math.min(t,a)));for(let l=t;l<a;l++)o[l]=n[l]+o[l-t]}else if(i===2){let o=new Uint16Array(r,s,a);for(let l=0;l<a;l++){let c=n[l]|n[a+l]<<8;o[l]=l<t?c:c+o[l-t]}}else if(i===4){let o=new Uint32Array(r,s,a),l=2*a,c=3*a;for(let h=0;h<a;h++){let u=(n[h]|n[a+h]<<8|n[l+h]<<16|n[c+h]<<24)>>>0;o[h]=h<t?u:u+o[h-t]}}else{let o=new Uint32Array(r,s,2*a),l=Zu?0:1,c=1-l;for(let h=0;h<a;h++){let u=(n[h]|n[a+h]<<8|n[2*a+h]<<16|n[3*a+h]<<24)>>>0,f=(n[4*a+h]|n[5*a+h]<<8|n[6*a+h]<<16|n[7*a+h]<<24)>>>0;if(h>=t){let d=2*(h-t);u+=o[d+l],f+=o[d+c]+(u>4294967295?1:0)}o[2*h+l]=u,o[2*h+c]=f}}}function ng(n){return Math.min(n.chunk_rows,n.shape[0])*n.shape.slice(1).reduce((e,t)=>e*t,1)*Mr(n.dtype)}async function ig(n,e,t,i){let r=Mr(e.dtype),s=e.shape[0],a=e.shape.slice(1).reduce((l,c)=>l*c,1),o=new ArrayBuffer(s*a*r);for(let[l,[c,h]]of e.chunks.entries()){let u=l*e.chunk_rows,f=Math.min(e.chunk_rows,s-u),d=i.subarray(0,f*a*r);await eg(t.subarray(c,c+h),d,`chunk ${l} of view ${n}`),tg(d,f,a,r,o,u*a*r)}return new Tr[e.dtype](o,0,s*a)}function rg(n,e,t){Rc(e)||R("1",`view ${n} is not an object`);let i=typeof e.encoding=="string"&&Object.hasOwn(Ju,e.encoding)?Ju[e.encoding]:null;i===null&&R("D2",`view ${n} has encoding ${JSON.stringify(e.encoding)}, which this reader does not know`);let r=Object.keys(e).filter(h=>!i.has(h));r.length>0&&R("D2",`view ${n} has keys ${r.sort().join(", ")} that this reader does not know`);let s=[...i].filter(h=>!Object.hasOwn(e,h));s.length>0&&R("D2",`view ${n} lacks the keys ${s.join(", ")}`),Km(e.dtype)||R("D1",`view ${n} has dtype ${JSON.stringify(e.dtype)}, not one of ${Object.keys(Tr).join(", ")}`);let a=e.shape;(!Array.isArray(a)||a.length===0||!a.every(Ts))&&R("D2",`view ${n} has shape ${JSON.stringify(a)}, not a nonempty list of counts`);let o=a.reduce((h,u)=>h*u,1)*Mr(e.dtype);if(Number.isSafeInteger(o)||R("D2",`view ${n} has shape [${a.join(", ")}], which is too large`),e.encoding==="raw"){(!Ts(e.offset)||!Ts(e.length))&&R("D2",`view ${n} has an offset or a length that is not a count`),e.offset%8!==0&&R("D2",`view ${n} starts at byte ${e.offset}, which is not a multiple of 8`),e.length!==o&&R("D2",`view ${n} has length ${e.length}, while shape [${a.join(", ")}] of ${e.dtype} takes ${o} bytes`),e.offset+e.length>t&&R("D2",`view ${n} runs past the end of the file, at bytes ${e.offset} to ${e.offset+e.length} of the payload`);return}let l=e.chunk_rows;(!Ts(l)||l<1)&&R("D5",`view ${n} has chunk_rows ${JSON.stringify(l)}, not a positive integer`),Array.isArray(e.chunks)||R("D5",`the chunks of view ${n} are not a list`);let c=Math.ceil(a[0]/l);e.chunks.length!==c&&R("D5",`view ${n} has ${e.chunks.length} chunks, while ${a[0]} rows in chunks of ${l} take ${c}`),e.chunks.forEach((h,u)=>{(!Array.isArray(h)||h.length!==2||!h.every(Ts))&&R("D5",`chunk ${u} of view ${n} is not an [offset, length] pair of counts`),h[0]+h[1]>t&&R("D5",`chunk ${u} of view ${n} runs past the end of the file`)})}var Er=class n{header;bytes;payloadStart;cache=new Map;constructor(e,t,i){this.header=e,this.bytes=t,this.payloadStart=i}static async parse(e){let t=ArrayBuffer.isView(e)?new DataView(e.buffer,e.byteOffset,e.byteLength):new DataView(e),i=t.byteLength;(i<Es||Zm.some((u,f)=>t.getUint8(f)!==u))&&R("1",'the bytes are not a TyCHO data container, since they lack the 12-byte preamble that starts with the magic "TYCD"');let r=t.getUint32(4,!0);r!==wr&&R("D3",`data container version ${r} is not supported, since this reader reads only version ${wr}`);let s=t.getUint32(8,!0);Es+s>i&&R("1",`the header length ${s} runs past the end of the file`);let a;try{let u=new TextDecoder("utf-8",{fatal:!0,ignoreBOM:!0}).decode(new Uint8Array(t.buffer,t.byteOffset+Es,s));a=JSON.parse(u)}catch(u){R("1",`the header is not JSON: ${u.message}`)}(a===null||typeof a!="object")&&R("1","the header is not a JSON object"),a.format!=="tycho-data"&&R("1",`header format is ${JSON.stringify(a.format)}, not "tycho-data"`),a.version!==wr&&R("D3",`header version ${JSON.stringify(a.version)} is not supported, since this reader reads only version ${wr}`),a.generator!==void 0&&typeof a.generator!="string"&&R("1","the header generator is not a string"),a.meta!==void 0&&!Rc(a.meta)&&R("1","the header meta is not an object"),Rc(a.views)||R("1",'the header lacks a "views" object');let o=Es+s+(8-(Es+s)%8)%8,l=Math.max(0,i-o);for(let[u,f]of Object.entries(a.views))rg(u,f,l);let c=new n(a,t,o),h=Object.entries(a.views).filter(u=>u[1].encoding==="shuffle-delta-deflate");if(h.length>0){typeof DecompressionStream>"u"&&R("D5","this runtime lacks DecompressionStream, which encoded views need");let u=new Uint8Array(t.buffer,t.byteOffset+o,l),f=new Uint8Array(Math.max(...h.map(([,d])=>ng(d))));for(let[d,g]of h){let y=await ig(d,g,u,f);c.cache.set(d,{name:d,dtype:g.dtype,shape:[...g.shape],data:y})}}return c}has(e){return Object.hasOwn(this.header.views,e)}names(){return Object.keys(this.header.views)}view(e){let t=this.cache.get(e);if(t)return t;this.has(e)||R("2.1",`the data container lacks view ${JSON.stringify(e)}`);let i=this.header.views[e],r=i.length/Mr(i.dtype),s=this.bytes.byteOffset+this.payloadStart+i.offset,a=Zu&&s%Mr(i.dtype)===0?new Tr[i.dtype](this.bytes.buffer,s,r):Qm(this.bytes,this.payloadStart+i.offset,r,i.dtype),o={name:e,dtype:i.dtype,shape:[...i.shape],data:a};return this.cache.set(e,o),o}};function sg(n){let e=atob(n.replace(/\s+/g,"")),t=new Uint8Array(new ArrayBuffer(e.length));for(let i=0;i<e.length;i++)t[i]=e.charCodeAt(i);return t}function Da(n,e="base64"){return e!=="base64"&&R("1",`data encoding ${e} is not base64`),sg(n)}var $i=0,As=3,Ku=new Set(["frames.origin_channel","layers.arrows","layers.driver_context","layers.outline"]),Qu=new Set(["format","version","requires","generator","title","theme","frames","bodies","track_sets","variables","clock","views","controls","readouts","initial"]),ka=/^[A-Za-z0-9_.-]+$/,lt="@index";function ed(n,e){return Number.isInteger(e)||R("2.6",`the frame index ${String(e)} is not an integer`),(!Number.isInteger(n)||n<1)&&R("2.6",`the clock has steps ${String(n)}, not a count of at least one`),(e%n+n)%n/n}var gi=class{m;c0;c1;u;constructor(e,t,i){let r=e.count(t);if(this.m=r,this.u=new Float64Array(r),i===lt){this.c0=0,this.c1=r-1;for(let l=0;l<r;l++)this.u[l]=l/(r-1);return}let s=e.channel(i,"C5"),a=e.start(t);this.c0=s[a],this.c1=s[a+r-1];let o=Math.sign(s[a+1]-s[a]);for(let l=0;l<r;l++)(!Number.isFinite(s[a+l])||l>0&&!((s[a+l]-s[a+l-1])*o>0))&&R("T3",`clock channel ${i} of track set ${e.id} is not both finite and strictly monotone along track ${t}`);Number.isFinite(this.c1-this.c0)||R("T3",`clock channel ${i} of track set ${e.id} has an infinite span along track ${t}`);for(let l=0;l<r;l++)this.u[l]=(s[a+l]-this.c0)/(this.c1-this.c0)}at(e){return this.u[e]}reading(e,t){if(e.mode==="fraction")return t;e.range===void 0&&R("C2","the clock is in value mode but does not have a range of two numbers");let[i,r]=e.range;return(i+t*(r-i)-this.c0)/(this.c1-this.c0)}locate(e){let t=0,i=this.m-2;for(;t<i;){let s=t+i+1>>1;this.u[s]<=e?t=s:i=s-1}let r=t;return{k:r,w:(e-this.u[r])/(this.u[r+1]-this.u[r])}}};function Ot(n){return n.laps===void 0?1:(n.mode==="value"&&R("C6","the clock is in value mode but has laps"),(!Number.isInteger(n.laps)||n.laps<1)&&R("C6",`the clock has laps ${String(n.laps)}, not an integer of at least one`),n.laps)}function Zt(n,e){let t=Math.min(Math.floor(n),e-1);return{lap:t,u:n-t}}function ei(n,e="clamp",t="clamp"){return n<0?e==="hidden"?null:0:n>1?t==="hidden"?null:1:n}function yi(n,e){return typeof n=="number"?(Number.isFinite(n)||R("S4",`a scalar is ${n}, not finite`),n):((n===null||typeof n!="object")&&R("2.2",`${JSON.stringify(n)} is not a scalar`),"attr"in n?(n.factor??1)*e.set.attr(n.attr)+(n.offset??0):(n.channel===lt&&R("2.2",`${lt} is not allowed in a frame edge`),e.set.channelAt(n.channel,e.track,e.sample,e.shifted,e.lap??0)))}function Pc(n,e,t=!1){if((!Array.isArray(n)||n.length!==3)&&R("F2",`${e} is three scalars, not ${JSON.stringify(n)}`),!t)for(let i of n)i!==null&&typeof i=="object"&&"channel"in i&&R("F2",`${e} takes a number or an attribute, not a channel`);return n}function td(n,e,t,i){let r=Math.cos(t),s=i?-Math.sin(t):Math.sin(t),[a,o,l]=n;return e==="z"?[r*a-s*o,s*a+r*o,l]:e==="x"?[a,r*o-s*l,s*o+r*l]:[r*a+s*l,o,-s*a+r*l]}var Ic=class{frames;depth=new Map;paths=new Map;root;constructor(e){this.frames=e;let t=Object.keys(e),i=t.filter(s=>e[s].parent===void 0);i.length!==1&&R("2.3",`the frames have ${i.length} roots, not one: ${JSON.stringify(i)}`),this.root=i[0];let r=e[this.root];(r.origin!==void 0||r.rotation!==void 0||r.scale!==void 0)&&R("2.3",`the root frame ${this.root} has an origin, a rotation, or a scale`);for(let s of t){let a=e[s].scale;(a===0||a!==void 0&&typeof a=="object"&&"attr"in a&&(a.factor??1)===0&&(a.offset??0)===0)&&R("F2",`the scale of frame ${s} is zero`)}for(let s of t){let a=0;for(let o=s;o!==this.root;a++){let l=e[o].parent;(l===void 0||!Object.hasOwn(e,l))&&R("2.3",`the parent ${l} of frame ${o} is not declared`),a>t.length&&R("2.3",`the parents of frame ${s} form a cycle`),o=l}this.depth.set(s,a)}}has(e){return this.depth.has(e)}frame(e){return this.has(e)||R("2.3",`frame ${JSON.stringify(e)} is not declared`),this.frames[e]}inSubtree(e,t){for(let i=e;i!==void 0;i=this.frames[i].parent)if(i===t)return!0;return!1}path(e,t){let i=this.paths.get(e),r=i?.get(t);if(r!==void 0)return r;this.frame(e),this.frame(t);let s=[],a=[],o=e,l=t;for(;this.depth.get(o)>this.depth.get(l);)s.push(o),o=this.frames[o].parent;for(;this.depth.get(l)>this.depth.get(o);)a.push(l),l=this.frames[l].parent;for(;o!==l;)s.push(o),a.push(l),o=this.frames[o].parent,l=this.frames[l].parent;let c={up:s,down:a.reverse()};return i===void 0&&this.paths.set(e,i=new Map),i.set(t,c),c}},Na=(n,e)=>{n===void 0||typeof n=="number"||("attr"in n?e.attrs.add(n.attr):e.channels.add(n.channel))},vi=class{tree;scene;active=new Set;edges=new Map;bodies=new Map;constructor(e){this.scene=e,this.tree=new Ic(e.frames);for(let t of Object.keys(e.frames))this.requirements(t,this.tree.root)}body(e){let t=this.bodies.get(e);if(t!==void 0)return t;let i=this.scene.bodies??{};Object.hasOwn(i,e)||R("2.4",`body ${JSON.stringify(e)} is not declared`);let r=i[e];return Object.hasOwn(this.scene.frames,r.frame)||R("2.4",`body ${e} is in frame ${JSON.stringify(r.frame)}, which is not declared`),Pc(r.position,`the position of body ${e}`),this.bodies.set(e,r),r}edgeOf(e){let t=this.edges.get(e);if(t===void 0){let i=this.tree.frame(e),r=Array.isArray(i.origin)?Pc(i.origin,`the origin of frame ${e}`,!0):i.origin;t={parent:i.parent,origin:r,rotation:i.rotation,scale:i.scale},this.edges.set(e,t)}return t}transform(e,t,i,r){let{up:s,down:a}=this.tree.path(t,i),o=e;for(let l of s)o=this.edge(l,o,r,!0);for(let l of a)o=this.edge(l,o,r,!1);return o}bodyPosition(e,t,i){let r=this.body(e),s=r.position.map(a=>yi(a,i));return this.transform(s,r.frame,t,i)}edge(e,t,i,r){let s=this.edgeOf(e),a=[0,0,0];if(Array.isArray(s.origin))a=[yi(s.origin[0],i),yi(s.origin[1],i),yi(s.origin[2],i)];else if(s.origin!==void 0){this.active.has(e)&&R("F6",`the origin of frame ${e} depends on itself`),this.active.add(e);try{a=this.bodyPosition(s.origin.body,s.parent,i)}finally{this.active.delete(e)}}let o=s.scale===void 0?1:yi(s.scale,i);o===0&&R("F2",`the scale of frame ${e} is zero`);let l=s.rotation,c=l===void 0?0:yi(l.angle,i);if(!r){let u=[t[0]-a[0],t[1]-a[1],t[2]-a[2]];return l!==void 0&&(u=td(u,l.axis,c,!1)),[o*u[0],o*u[1],o*u[2]]}let h=[t[0]/o,t[1]/o,t[2]/o];return l!==void 0&&(h=td(h,l.axis,c,!0)),[a[0]+h[0],a[1]+h[1],a[2]+h[2]]}requirements(e,t,i={channels:new Set,attrs:new Set}){let{up:r,down:s}=this.tree.path(e,t);for(let a of[...r,...s]){this.active.has(a)&&R("F6",`the origin of frame ${a} depends on itself`),this.active.add(a);try{let o=this.tree.frame(a);Array.isArray(o.origin)?Pc(o.origin,`the origin of frame ${a}`,!0).forEach(l=>Na(l,i)):o.origin!==void 0&&this.bodyRequirements(o.origin.body,o.parent,i),Na(o.rotation?.angle,i),Na(o.scale,i)}finally{this.active.delete(a)}}return i}bodyRequirements(e,t,i={channels:new Set,attrs:new Set}){let r=this.body(e);return r.position.forEach(s=>Na(s,i)),this.requirements(r.frame,t,i)}};function it(n,e){return n.variables!==void 0&&Object.hasOwn(n.variables,e)?n.variables[e]:void 0}function xi(n,e){let t=it(n.scene,e);t===void 0&&R("2.5",`variable ${JSON.stringify(e)} is not declared`);let i=t.scope==="panel"?n.panel.variables:n.state.variables,r=i!==void 0&&Object.hasOwn(i,e)?i[e]:void 0;return r===void 0?t.default:r}function Oa(n,e){return n.kind==="selector"?typeof e=="number"&&Number.isFinite(e):n.kind==="toggle"?typeof e=="boolean":typeof e=="string"&&n.values.includes(e)}function Ar(n,e){n.clock.channels.includes(e.clock.channel)||R("2.6",`the state's clock channel ${JSON.stringify(e.clock.channel)} is not one of the scene's clock channels`);let t=(s,a)=>{for(let[o,l]of Object.entries(s??{})){let c=it(n,o);c!==void 0&&!Oa(c,l)&&R("2.5",`${a}: ${c.kind} ${o} cannot hold ${JSON.stringify(l)}`)}};t(e.variables,"the state");let i=Object.keys(e.panels);i.length===0&&R("2.8","the state does not have a panel");for(let[s,a]of Object.entries(e.panels))Object.hasOwn(n.views,a.view)||R("2.8",`panel ${s} shows ${JSON.stringify(a.view)}, which is not a view`),t(a.variables,`panel ${s}`);let r=Xi(e.layout).sort();(r.length!==i.length||r.some((s,a)=>s!==i.slice().sort()[a]))&&R("2.8",`the layout shows the panels ${r.join(", ")}, while the state has the panels ${i.slice().sort().join(", ")}`)}function Xi(n,e=[]){return n.kind==="panel"?e.push(n.id):(Xi(n.a,e),Xi(n.b,e)),e}function ag(n,e){return typeof e=="string"?e:xi(n,e.var)}function Cs(n,e){if("set"in e)return Object.hasOwn(n.scene.track_sets,e.set)||R("V2",`the set query names ${JSON.stringify(e.set)}, which is not a track set`),[e.set];(e.tags===null||typeof e.tags!="object")&&R("V2",`a tags query has tags ${JSON.stringify(e.tags)}, not an object`);let t=Object.entries(e.tags).map(([i,r])=>[i,ag(n,r)]);return Object.entries(n.scene.track_sets).filter(([,i])=>t.every(([r,s])=>Object.hasOwn(i.tags??{},r)&&i.tags[r]===s)).map(([i])=>i)}function rn(n,e){let t=Cs(n,e);return t.length>1&&R("V2",`the set query ${JSON.stringify(e)} matches the ${t.length} track sets ${t.join(", ")}, where one is needed`),t[0]??null}function Ua(n,e,t){let i=it(n.scene,e.var);(i===void 0||i.kind!=="selector")&&R("V3",`variable ${e.var} is not a selector`);let r=xi(n,e.var);if((typeof r!="number"||!Number.isFinite(r))&&R("2.5",`selector ${e.var} holds ${JSON.stringify(r)}, not a finite number`),(i.by??"nearest")==="index")return Math.min(Math.max(Math.floor(r+.5),0),t.tracks-1);let a=i.parameter;a===void 0&&R("2.5",`selector ${e.var} is by nearest but does not name a parameter`);let o=t.parameter(a,"V3"),l=0;for(let c=1;c<t.tracks;c++)Math.abs(o[c]-r)<Math.abs(o[l]-r)&&(l=c);return l}function nd(n,e){return(!Number.isInteger(n)||n<0)&&R("V3",`member index ${JSON.stringify(n)} is not a track index`),n>=e.tracks&&R("V3",`member index ${n} is not below the track count ${e.tracks} of track set ${e.id}`),n}function og(n,e){(!Number.isInteger(e)||e<1)&&R("V3",`member count ${JSON.stringify(e)} is not an integer of at least one`);let t=e>=n?1:Math.floor(n/e+.5),i=[];for(let r=0;r<n;r+=t)i.push(r);return i[i.length-1]!==n-1&&i.push(n-1),i}function Rs(n,e,t){return e==="all"?Array.from({length:t.tracks},(i,r)=>r):((e===null||typeof e!="object")&&R("V3",`a member reference is "all", {index}, {count}, or {var}, not ${JSON.stringify(e)}`),"index"in e?[nd(e.index,t)]:"count"in e?og(t.tracks,e.count):[Ua(n,e,t)])}function Cr(n,e,t){return e==="all"&&R("V3",`the driver's member is "all", but a driver resolves to one track`),(e===null||typeof e!="object")&&R("V3",`the driver's member is {index} or {var}, not ${JSON.stringify(e)}`),"count"in e&&R("V3","the driver's member is a count, but a driver resolves to one track"),"index"in e?nd(e.index,t):Ua(n,e,t)}function Fa(n,e){let{scene:t,state:i}=n,r=Xi(i.layout).find(s=>i.panels[s]?.view===e);return r===void 0?null:{panel:r,frame:qi({scene:t,state:i,panel:i.panels[r]},t.views[e])}}function qi(n,e){let t=typeof e.frame=="string"?e.frame:xi(n,e.frame.var);return(typeof t!="string"||!Object.hasOwn(n.scene.frames,t))&&R("2.7",`the view displays ${JSON.stringify(t)}, which is not a frame`),t}function Rr(n,e){if(e.visible===void 0)return!0;let t=it(n.scene,e.visible.var);(t===void 0||t.kind!=="toggle")&&R("L5",`a layer's visible names ${e.visible.var}, which is not a toggle`);let i=xi(n,e.visible.var);return typeof i!="boolean"&&R("L5",`toggle ${e.visible.var} holds ${JSON.stringify(i)}, not a boolean`),i}function Rt(n,e,t,i=0){let{k:r,w:s}=n.locate(e);return{k:r,w:s,shifted:t,lap:i}}function Ba(n,e,t,i=0){if(e===t)return[Rt(n,e,!1,i)];let r=[Rt(n,e,!1,i)];for(let s=0;s<n.m;s++){let a=n.at(s);e<a&&a<t&&r.push({sample:s,shifted:!1,lap:i})}return r.push(Rt(n,t,!1,i)),r}function id(n,e,t,i){let r=Zt(e,i),s=Zt(t,i);if(r.lap===s.lap)return Ba(n,r.u,s.u,r.lap);let a=Ba(n,r.u,1,r.lap).slice(0,-1);for(let o=r.lap+1;o<s.lap;o++)a.push(...Ba(n,0,1,o).slice(0,-1));return a.push(...Ba(n,0,s.u,s.lap)),a}function lg(n,e,t){let i=t?e:1,r=[];for(let s=0;s<i;s++)for(let a=0;a<(s===i-1?n:n-1);a++)r.push({sample:a,shifted:!1,lap:s});return r}function rd(n,e,t,i,r){let s=e-t*i;return s<0&&!r&&(s=0),id(n,s,e,t)}function bi(n){return n.head===!0||typeof n.head=="object"&&n.head!==null}function Pr(n,e,t,i){let r=n.lap??0;if("sample"in n)return i({set:e,track:t,sample:n.sample,shifted:n.shifted,lap:r});let s=i({set:e,track:t,sample:n.k,shifted:n.shifted,lap:r}),a=i({set:e,track:t,sample:n.k+1,shifted:n.shifted,lap:r}),o=n.w;return[(1-o)*s[0]+o*a[0],(1-o)*s[1]+o*a[1],(1-o)*s[2]+o*a[2]]}function Ps(n,e,t=new gi(e.set,e.track,n.channel)){let i=Ot(n.clock),r=i*ei(t.reading(n.clock,n.q)),s=Zt(r,i);return{tc:t,loopReading:r,at:Rt(t,s.u,!1,s.lap)}}function za(n,e){let t=e.lap??0,{set:i,track:r}=n;return{a:{set:i,track:r,sample:e.k,shifted:!1,lap:t},b:{set:i,track:r,sample:e.k+1,shifted:!1,lap:t},w:e.w}}function sd(n,e,t,i=null){if(t===null)return{kind:"track",set:null,members:[]};let r=e.reveal??"none";["none","grow","trail"].includes(r)||R("2.7",`a track layer's reveal is ${JSON.stringify(r)}, not none, grow, or trail`);for(let d of["before","after"])e[d]!==void 0&&e[d]!=="clamp"&&e[d]!=="hidden"&&R("C3",`a track layer's ${d} is ${JSON.stringify(e[d])}, not clamp or hidden`);r==="trail"&&Lc(e);let s=e.context??"own";s!=="own"&&s!=="driver"&&R("L6",`a track layer's context is ${JSON.stringify(s)}, not own or driver`);let a=Ot(n.clock),o=t.def.frame,l=d=>n.frames.transform(t.position(d.track,d.sample),o,n.display,d),c=s==="driver"&&i!==null?za(i,Ps(n,i).at):null;if(c!==null){let{a:d,b:g,w:y}=c;l=m=>{let p=t.position(m.track,m.sample),b=n.frames.transform(p,o,n.display,d),_=n.frames.transform(p,o,n.display,g);return[(1-y)*b[0]+y*_[0],(1-y)*b[1]+y*_[1],(1-y)*b[2]+y*_[2]]}}let h=bi(e),u=r!=="none"||h||n.clock.mode==="value"&&(e.before==="hidden"||e.after==="hidden");u&&a>1&&!t.periodic&&R("C6",`a reading is taken on track set ${t.id}, which is not periodic, and the clock has ${a} laps`);let f=[];for(let d of Rs(n.scope,e.members,t)){let g=[],y=null,m=null;u&&(m=new gi(t,d,n.channel),y=ei(m.reading(n.clock,n.q),e.before,e.after));let p=u&&y===null||s==="driver"&&c===null,b=a*(y??0);p||(r==="none"?g.push(...lg(t.count(d),a,t.periodic)):r==="grow"?g.push(...id(m,0,b,a)):g.push(...rd(m,b,a,Lc(e),t.periodic)));let _={index:d,line:g.map(v=>Pr(v,t,d,l))};if(h){let v=Zt(b,a);_.head=p?null:Pr(Rt(m,v.u,!1,v.lap),t,d,l)}f.push(_)}return{kind:"track",set:t.id,members:f}}function Dc(n){let e=n.vector;(!Array.isArray(e)||e.length<2||e.length>3||!e.every(i=>typeof i=="string"))&&R("L7",`an arrow layer's vector is ${JSON.stringify(e)}, not two or three channel names`),e.includes(lt)&&R("L7",`${lt} is not allowed in the vector of an arrow layer`);let t=n.scale??1;return typeof t=="object"&&t!==null&&"channel"in t&&R("L7","the scale of an arrow layer takes a number or an attribute, not a channel"),{vector:e,scale:t}}function Va(n,e,t,i){let{vector:r,scale:s}=Dc(e);for(let h of["before","after"])e[h]!==void 0&&e[h]!=="clamp"&&e[h]!=="hidden"&&R("C3",`an arrow layer's ${h} is ${JSON.stringify(e[h])}, not clamp or hidden`);if(t===null)return{kind:"arrow",set:null,members:[]};for(let h of r)t.hasChannel(h)||R("L7",`track set ${t.id} lacks channel ${JSON.stringify(h)} of an arrow layer's vector`);let a=Ot(n.clock);a>1&&!t.periodic&&R("C6",`a reading is taken on track set ${t.id}, which is not periodic, and the clock has ${a} laps`);let o=t.def.frame,l=r.map(h=>t.channel(h)),c=[];for(let h of Rs(n.scope,e.members,t)){let u=i?i(h):new gi(t,h,n.channel),f=ei(u.reading(n.clock,n.q),e.before,e.after);if(f===null){c.push({index:h,base:null,tip:null});continue}let d=yi(s,{set:t,track:h,sample:0,shifted:!1,lap:0}),g=t.start(h),y=_=>n.frames.transform(t.position(_.track,_.sample),o,n.display,_),m=_=>{let v=t.position(_.track,_.sample);for(let E=0;E<l.length;E++)v[E]+=d*l[E][g+_.sample];return n.frames.transform(v,o,n.display,_)},p=Zt(a*f,a),b=Rt(u,p.u,!1,p.lap);c.push({index:h,base:Pr(b,t,h,y),tip:Pr(b,t,h,m)})}return{kind:"arrow",set:t.id,members:c}}function kc(n,e,t){let i=t.view;(typeof i!="string"||!Object.hasOwn(n.views,i))&&R("L8",`an outline layer names ${JSON.stringify(i)}, which is not a view`),i===e&&R("L8",`an outline layer of view ${e} names its own view`),(n.views[i].camera?.kind??"plane")!=="plane"&&R("L8",`an outline layer names view ${i}, whose camera is not a plane camera`)}function Ha(n,e,t){kc(n.scope.scene,n.scope.panel.view,e);let i={kind:"outline",view:e.view,panel:null,frame:null,origin:null,axes:null},r=Fa(n.scope,e.view);if(r===null||(i.panel=r.panel,i.frame=r.frame,t===null))return i;let{a:s,b:a,w:o}=za(t,Ps(n,t).at),l=u=>{let f=n.frames.transform(u,r.frame,n.display,s),d=n.frames.transform(u,r.frame,n.display,a);return[(1-o)*f[0]+o*d[0],(1-o)*f[1]+o*d[1],(1-o)*f[2]+o*d[2]]},c=l([0,0,0]),h=u=>{let f=l(u);return[f[0]-c[0],f[1]-c[1],f[2]-c[2]]};return i.origin=c,i.axes=[h([1,0,0]),h([0,1,0]),h([0,0,1])],i}function Lc(n){n.trail===void 0&&R("2.7","a layer draws a trail but lacks a trail fraction");let e=n.trail.fraction;return(typeof e!="number"||!(e>0&&e<=1))&&R("2.7",`the trail fraction ${String(e)} is not in (0, 1]`),e}function ad(n,e,t){let i={kind:"body",body:e.body,position:null};if(t===null)return e.trail!==void 0&&(i.trail=[]),i;let{set:r,track:s}=t,a=Ot(n.clock),{tc:o,loopReading:l,at:c}=Ps(n,t),h=u=>n.frames.bodyPosition(e.body,n.display,u);return i.position=Pr(c,r,s,h),e.trail!==void 0&&(i.trail=rd(o,l,a,Lc(e),r.periodic).map(u=>Pr(u,r,s,h))),i}var Nc=class{id;def;tracks;samples;dim;data;offsets;positions;channels=new Map;parameters=new Map;constructor(e,t,i){this.id=e,this.def=t,this.data=i,this.tracks=t.tracks;let r=i.view(t.offsets);(r.dtype!=="uint32"||r.shape.length!==1||r.shape[0]!==t.tracks+1)&&R("2.1",`track set ${e}: offsets view ${t.offsets} is ${r.dtype} of shape (${r.shape.join(", ")}), not uint32 of shape (${t.tracks+1},)`),this.offsets=r.data,this.offsets[0]!==0&&R("2.1",`track set ${e}: offsets[0] is ${this.offsets[0]}, not 0`);for(let l=0;l<t.tracks;l++){let c=this.offsets[l+1]-this.offsets[l];c<2&&R("T1",`track set ${e}: the sample count of track ${l} is ${c}, fewer than two`)}this.samples=this.offsets[t.tracks];let s=i.view(t.positions),[a,o]=s.shape;(s.shape.length!==2||a!==this.samples||o!==2&&o!==3)&&R("2.1",`track set ${e}: positions view ${t.positions} has shape (${s.shape.join(", ")}), not (${this.samples}, 2) or (${this.samples}, 3)`),this.positions=s.data,this.dim=o}get periodic(){return this.def.periodic===!0}start(e){return this.offsets[e]}count(e){return this.offsets[e+1]-this.offsets[e]}position(e,t){let i=(this.offsets[e]+t)*this.dim,r=this.positions;return[r[i],r[i+1],this.dim===3?r[i+2]:0]}hasChannel(e){return e===lt||Object.hasOwn(this.def.channels??{},e)}channel(e,t="F5"){let i=this.channels.get(e);if(i)return i;let r=this.def.channels?.[e];(r===void 0||!Object.hasOwn(this.def.channels??{},e))&&R(t,`track set ${this.id} lacks channel ${JSON.stringify(e)}`);let s=this.data.view(r.view);return(s.shape.length!==1||s.shape[0]!==this.samples)&&R("2.1",`track set ${this.id}: channel ${e} has shape (${s.shape.join(", ")}), not (${this.samples},)`),this.channels.set(e,s.data),s.data}channelAt(e,t,i,r,s=0){let a=this.count(t),o=s-(r?1:0);if(e===lt)return o===0?i:i+o*(a-1);let l=this.channel(e),c=this.offsets[t],h=l[c+i];return o===0?h:h+o*(l[c+a-1]-l[c])}parameter(e,t="2.5"){let i=this.parameters.get(e);if(i)return i;let r=this.def.parameters?.[e];(r===void 0||!Object.hasOwn(this.def.parameters??{},e))&&R(t,`track set ${this.id} lacks parameter ${JSON.stringify(e)}`);let s=this.data.view(r.view);return(s.shape.length!==1||s.shape[0]!==this.tracks)&&R("2.1",`track set ${this.id}: parameter ${e} has shape (${s.shape.join(", ")}), not (${this.tracks},)`),this.parameters.set(e,s.data),s.data}hasAttr(e){return Object.hasOwn(this.def.attrs??{},e)}attr(e){let t=this.def.attrs?.[e];return(t===void 0||!this.hasAttr(e))&&R("F5",`track set ${this.id} lacks attribute ${JSON.stringify(e)}`),t}},_i=class{scene;data;sets=new Map;constructor(e,t){this.scene=e,this.data=t}get(e){let t=this.sets.get(e);if(!t){let i=this.scene.track_sets[e];(i===void 0||!Object.hasOwn(this.scene.track_sets,e))&&R("2.1",`track set ${JSON.stringify(e)} is not declared`),t=new Nc(e,i,this.data),this.sets.set(e,t)}return t}};var cg=["track","arrow","outline","body","axes","grid"],hg=["slider","tabs","toggle","transport"],Ga=["viridis","plasma","cividis","blues","reds"],ld=(n,e)=>{ka.test(n)||R("S3",`${e} ${JSON.stringify(n)} does not match [A-Za-z0-9_.-]+`)},bn=n=>typeof n=="number"&&Number.isFinite(n),Is=/^#[0-9a-fA-F]{6}$/;function Si(n,e,t,i){if(!(n===null||typeof n!="object"||Array.isArray(n)))for(let r of Object.keys(n))e.includes(r)||i.push(`${t} has a key ${JSON.stringify(r)} that this reader does not know`)}var ug=["label","axes","unit","parent","origin","rotation","scale"],dg=["label","frame","position","color"],fg=["label","frame","tags","attrs","tracks","offsets","positions","channels","parameters","periodic"],pg=["label","frame","camera","driver","layers"],mg=["kind","plane","aspect"],gg=["kind","projection","up","stretch","turn"],od={track:["kind","sets","members","reveal","trail","head","before","after","context","fit","color","opacity","width","highlight","visible"],arrow:["kind","sets","members","vector","scale","before","after","color","opacity","width","head","visible"],outline:["kind","view","color","opacity","width","dash","min_size","visible"],body:["kind","body","trail","size","visible"],axes:["kind","span","visible"],grid:["kind","labels","visible"]},yg=["mode","channels","labels","steps","range","laps","seconds"],vg=["background","foreground","grid"];function xg(n){n.format!=="tycho-scene"&&R("2",`the format is ${JSON.stringify(n.format)}, not "tycho-scene"`);let e=[],t=/^([0-9]+)\.([0-9]+)$/.exec(String(n.version));t===null?e.push(`version ${JSON.stringify(n.version)} is not "major.minor"`):Number(t[1])!==0?e.push(`major version ${t[1]} is unknown to this reader, which reads ${0}.x`):Number(t[2])>3&&e.push(`version ${t[1]}.${t[2]} is newer than this reader's ${0}.${3}, and the format is unstable until 1.0`);let i=(n.requires??[]).filter(r=>!Ku.has(r));i.length>0&&e.push(`the required features ${i.join(", ")} are not implemented`),e.length>0&&R("S1",e.join(", and "))}function Rn(n,e,t,i){let r=it(n,e);r===void 0&&R(i,`variable ${JSON.stringify(e)} is not declared`),t!==null&&r.kind!==t&&R(i,`variable ${e} is a ${r.kind}, not a ${t}`)}function Wa(n,e,t){if(n!==void 0){if(typeof n=="number"){Number.isFinite(n)||R("S4",`${e} is ${String(n)}, not finite`);return}if("attr"in n){(!bn(n.factor??1)||!bn(n.offset??0))&&R("S4",`${e} has a factor or offset that is not finite`);return}t&&R("F2",`${e} takes a number or an attribute, not a channel`),n.channel===lt&&R("2.2",`${e} reads channel ${lt}, which is not allowed in a frame edge`)}}function Oc(n,e){if("set"in e)Object.hasOwn(n.track_sets,e.set)||R("V2",`the set query names ${JSON.stringify(e.set)}, which is not a track set`);else for(let t of Object.values(e.tags))typeof t=="object"&&t!==null&&Rn(n,t.var,"choice","V2")}var Yi=n=>typeof n=="number"&&n>=0&&n<=1;function cd(n,e){e.fraction>0&&e.fraction<=1||R("2.7",`view ${n}: a trail fraction is ${e.fraction}, not in (0, 1]`),e.taper!==void 0&&!(Yi(e.taper.width??0)&&Yi(e.taper.opacity??0))&&R("2.7",`view ${n}: a trail taper is not in [0, 1]`)}function hd(n,e,t){Oc(n,t.sets),typeof t.members=="object"&&"var"in t.members&&Rn(n,t.members.var,"selector","V3"),typeof t.members=="object"&&"count"in t.members&&!(Number.isInteger(t.members.count)&&t.members.count>=1)&&R("V3",`view ${e}: member count ${JSON.stringify(t.members.count)} is not an integer of at least one`)}function bg(n,e,t){hd(n,e,t),Dc(t);for(let i of["before","after"])t[i]!==void 0&&t[i]!=="clamp"&&t[i]!=="hidden"&&R("C3",`view ${e}: an arrow layer's ${i} is ${JSON.stringify(t[i])}, not clamp or hidden`);t.color!==void 0&&!Is.test(t.color)&&R("L7",`view ${e}: an arrow layer's color is ${JSON.stringify(t.color)}, not a #rrggbb color`),t.head?.size!==void 0&&!(t.head.size>0)&&R("L7",`view ${e}: an arrowhead size is ${t.head.size}, not positive`),t.opacity!==void 0&&!Yi(t.opacity)&&R("2.7",`view ${e}: an arrow layer's opacity is ${t.opacity}, not in [0, 1]`),t.width!==void 0&&!(t.width>0)&&R("2.7",`view ${e}: an arrow layer's width is ${t.width}, not positive`)}function _g(n,e,t){kc(n,e,t),t.color!==void 0&&!Is.test(t.color)&&R("L8",`view ${e}: an outline layer's color is ${JSON.stringify(t.color)}, not a #rrggbb color`),t.opacity!==void 0&&!Yi(t.opacity)&&R("2.7",`view ${e}: an outline layer's opacity is ${t.opacity}, not in [0, 1]`),t.width!==void 0&&!(t.width>0)&&R("2.7",`view ${e}: an outline layer's width is ${t.width}, not positive`);let i=t.dash;i!==void 0&&!(Array.isArray(i)&&i.length===2&&i.every(r=>bn(r)&&r>0))&&R("L8",`view ${e}: an outline layer's dash is ${JSON.stringify(i)}, not two positive lengths`),t.min_size!==void 0&&!(bn(t.min_size)&&t.min_size>=0)&&R("L8",`view ${e}: an outline layer's min_size is ${t.min_size}, not a nonnegative length`)}function Sg(n,e,t){hd(n,e,t),t.fit!==void 0&&typeof t.fit!="boolean"&&R("2.7",`view ${e}: a track layer's fit is ${JSON.stringify(t.fit)}, not a boolean`);let i=t.highlight;if(i!==void 0&&(Rn(n,i.var,"selector","2.7"),i.width!==void 0&&!(i.width>0)&&R("2.7",`view ${e}: a highlight width is ${i.width}, not positive`),i.opacity!==void 0&&!Yi(i.opacity)&&R("2.7",`view ${e}: a highlight opacity is ${i.opacity}, not in [0, 1]`),i.kernel!==void 0)){i.kernel.width>0&&i.kernel.width<=1||R("2.7",`view ${e}: a highlight kernel's width is ${i.kernel.width}, not in (0, 1]`),Yi(i.kernel.opacity)||R("2.7",`view ${e}: a highlight kernel's opacity is ${i.kernel.opacity}, not in [0, 1]`);let s=it(n,i.var);s?.kind==="selector"&&s.by==="index"&&R("2.7",`view ${e}: a highlight kernel needs a selector by nearest, and ${i.var} is by index`)}let r=t.reveal??"none";["none","grow","trail"].includes(r)||R("2.7",`view ${e}: a track layer's reveal is ${JSON.stringify(r)}, not none, grow, or trail`),r==="trail"&&t.trail===void 0&&R("2.7",`view ${e}: a track layer has reveal "trail" but lacks a trail`),t.trail!==void 0&&cd(e,t.trail),t.head!==void 0&&typeof t.head!="boolean"&&((typeof t.head!="object"||t.head===null)&&R("L3",`view ${e}: a track layer's head is ${JSON.stringify(t.head)}, not a boolean or an object`),t.head.color!==void 0&&!Is.test(t.head.color)&&R("L3",`view ${e}: a head color is ${JSON.stringify(t.head.color)}, not a #rrggbb color`),t.head.size!==void 0&&!(t.head.size>0)&&R("L3",`view ${e}: a head size is ${t.head.size}, not positive`));for(let s of["before","after"])t[s]!==void 0&&t[s]!=="clamp"&&t[s]!=="hidden"&&R("C3",`view ${e}: a track layer's ${s} is ${JSON.stringify(t[s])}, not clamp or hidden`);if(t.context!==void 0&&t.context!=="own"&&t.context!=="driver"&&R("L6",`view ${e}: a track layer's context is ${JSON.stringify(t.context)}, not own or driver`),t.opacity!==void 0&&!Yi(t.opacity)&&R("2.7",`view ${e}: a track layer's opacity is ${t.opacity}, not in [0, 1]`),t.width!==void 0&&!(t.width>0)&&R("2.7",`view ${e}: a track layer's width is ${t.width}, not positive`),t.color!==void 0&&typeof t.color=="object"){let s=t.color.colormap;if(typeof s=="object"&&s!==null){Rn(n,s.var,"choice","2.7");let a=it(n,s.var).values,o=Object.keys(s.map??{}),l=a.filter(h=>!Object.hasOwn(s.map,h)),c=o.filter(h=>!a.includes(h));l.length>0&&R("2.7",`view ${e}: a colormap keyed on ${s.var} does not name a colormap for ${JSON.stringify(l)}`),c.length>0&&R("2.7",`view ${e}: a colormap keyed on ${s.var} maps ${JSON.stringify(c)}, which are not its values`);for(let h of o)Ga.includes(s.map[h])||R("2.7",`view ${e}: the colormap ${JSON.stringify(s.map[h])} is not one of ${Ga.join(", ")}`)}else Ga.includes(s)||R("2.7",`view ${e}: the colormap ${JSON.stringify(s)} is not one of ${Ga.join(", ")}`);"parameter"in t.color=="channel"in t.color&&R("2.7",`view ${e}: a colormap color names both or neither of parameter and channel`)}}function $a(n,e,t){let i=[];xg(n);for(let o of Object.keys(n))Qu.has(o)||i.push(`the scene has a top-level key ${JSON.stringify(o)} that this reader does not know`);Si(n.theme,vg,"the theme",i);for(let[o,l]of Object.entries(n.theme??{}))(typeof l!="string"||!Is.test(l))&&R("2",`theme ${o} is ${JSON.stringify(l)}, not a #rrggbb color`);Si(n.clock,yg,"the clock",i);for(let[o,l]of Object.entries(n.frames))Si(l,ug,`frame ${o}`,i);for(let[o,l]of Object.entries(n.bodies??{}))Si(l,dg,`body ${o}`,i),l.color!==void 0&&!Is.test(l.color)&&R("2.4",`body ${o} has color ${JSON.stringify(l.color)}, not #rrggbb`);for(let[o,l]of Object.entries(n.track_sets))Si(l,fg,`track set ${o}`,i);for(let[o,l]of Object.entries(n.views)){Si(l,pg,`view ${o}`,i),l.camera!==void 0&&Si(l.camera,l.camera.kind==="orbit"?gg:mg,`the camera of view ${o}`,i);for(let c of l.layers)Object.hasOwn(od,c.kind)&&Si(c,od[c.kind],`a ${c.kind} layer of view ${o}`,i)}for(let[o,l]of[["frame",n.frames],["body",n.bodies],["track set",n.track_sets],["variable",n.variables],["view",n.views]])for(let c of Object.keys(l??{}))ld(c,o);let r=new vi(n),s=o=>r.tree.has(o);for(let[o,l]of Object.entries(n.frames))Array.isArray(l.origin)&&l.origin.forEach(c=>Wa(c,`the origin of frame ${o}`,!1)),Wa(l.rotation?.angle,`the rotation of frame ${o}`,!1),Wa(l.scale,`the scale of frame ${o}`,!1),l.axes!==void 0&&l.axes.length!==3&&R("2.3",`frame ${o} has ${l.axes.length} axis labels, not three`);for(let[o,l]of Object.entries(n.bodies??{}))s(l.frame)||R("2.4",`body ${o} is in frame ${l.frame}, which is not declared`),l.position.forEach(c=>Wa(c,`the position of body ${o}`,!0));Object.keys(n.track_sets).length===0&&R("2.1","the scene does not have a track set");for(let[o,l]of Object.entries(n.track_sets)){s(l.frame)||R("2.1",`track set ${o} is in frame ${l.frame}, which is not declared`),(!Number.isInteger(l.tracks)||l.tracks<1)&&R("2.1",`track set ${o} has tracks ${String(l.tracks)}, not a count of at least one`),Object.hasOwn(l.channels??{},lt)&&R("S3",`track set ${o} declares a channel named ${lt}, which is reserved`);for(let[c,h]of Object.entries(l.attrs??{}))bn(h)||R("S4",`attribute ${c} of track set ${o} is not finite`)}for(let[o,l]of Object.entries(n.variables??{}))if(l.kind==="selector")l.by!=="index"&&l.parameter===void 0&&R("2.5",`selector ${o} is by nearest but does not name a parameter`),bn(l.default)||R("2.5",`selector ${o} defaults to ${String(l.default)}, not a finite number`);else if(l.kind==="choice")l.values.includes(l.default)||R("2.5",`choice ${o} defaults to ${JSON.stringify(l.default)}, which is not one of its values`),l.labels!==void 0&&l.labels.length!==l.values.length&&R("2.5",`choice ${o} has ${l.labels.length} labels for ${l.values.length} values`);else if(l.kind==="toggle"){let c=l.default;typeof c!="boolean"&&R("2.5",`toggle ${o} defaults to ${JSON.stringify(c)}, not a boolean`)}else R("2.5",`variable ${o} has kind ${JSON.stringify(l.kind)}, not selector, choice, or toggle`);let a=n.clock;a.mode!=="fraction"&&a.mode!=="value"&&R("2.6",`the clock mode is ${JSON.stringify(a.mode)}, not fraction or value`),(!Number.isInteger(a.steps)||a.steps<1)&&R("2.6",`the clock has steps ${String(a.steps)}, not a count of at least one`),a.mode==="value"&&(a.range===void 0&&R("C2","the clock is in value mode but does not have a range of two numbers"),a.range.every(bn)||R("S4","the clock range is not finite")),a.labels!==void 0&&a.labels.length!==a.channels.length&&R("2.6",`the clock has ${a.labels.length} labels for ${a.channels.length} channels`),a.seconds!==void 0&&!(bn(a.seconds)&&a.seconds>0)&&R("2.6",`the clock seconds are ${JSON.stringify(a.seconds)}, not a positive finite number`),Ot(a);for(let[o,l]of Object.entries(n.views)){if(typeof l.frame=="string")s(l.frame)||R("2.7",`view ${o} displays ${l.frame}, which is not a frame`);else{Rn(n,l.frame.var,"choice","2.7");let h=it(n,l.frame.var);if(h.kind==="choice")for(let u of h.values)s(u)||R("2.7",`the frame of view ${o} can be ${u}, which is not a frame`)}Oc(n,l.driver.sets),l.driver.member==="all"&&R("V3",`view ${o}: the driver's member is "all", but a driver resolves to one track`),"count"in l.driver.member&&R("V3",`view ${o}: the driver's member is a count, but a driver resolves to one track`),"var"in l.driver.member&&Rn(n,l.driver.member.var,"selector","V3"),l.camera!==void 0&&l.camera.kind!=="plane"&&l.camera.kind!=="orbit"&&R("2.7",`view ${o}: a camera kind is ${JSON.stringify(l.camera.kind)}, not plane or orbit`);let c=l.camera?.aspect;if(l.camera?.kind==="plane"&&c!==void 0&&c!=="equal"&&c!=="free"&&R("2.7",`view ${o}: a plane camera's aspect is ${JSON.stringify(c)}, not equal or free`),l.camera?.kind==="orbit"){let{stretch:h,turn:u}=l.camera;h!==void 0&&!(Array.isArray(h)&&h.length===3&&h.every(f=>bn(f)&&f>0))&&R("2.7",`view ${o}: an orbit camera's stretch is ${JSON.stringify(h)}, not three positive finite factors`),u!==void 0&&!bn(u)&&R("2.7",`view ${o}: an orbit camera's turn is ${JSON.stringify(u)}, not a finite number of degrees`)}for(let h of l.layers)cg.includes(h.kind)||R("S1",`view ${o}: layer kind ${JSON.stringify(h.kind)} is not implemented`),h.visible!==void 0&&Rn(n,h.visible.var,"toggle","L5"),h.kind==="track"?Sg(n,o,h):h.kind==="arrow"?bg(n,o,h):h.kind==="outline"?_g(n,o,h):h.kind==="body"?(Object.hasOwn(n.bodies??{},h.body)||R("L4",`view ${o} draws ${h.body}, which is not a body`),h.trail!==void 0&&cd(o,h.trail),h.size!==void 0&&!(h.size>0)&&R("2.7",`view ${o}: a body layer's size is ${h.size}, not positive`)):h.kind==="axes"?h.span!==void 0&&h.span!=="full"&&h.span!=="positive"&&R("2.7",`view ${o}: an axes layer's span is ${JSON.stringify(h.span)}, not full or positive`):h.labels!==void 0&&typeof h.labels!="boolean"&&R("2.7",`view ${o}: a grid layer's labels is ${JSON.stringify(h.labels)}, not a boolean`)}for(let o of n.controls??[])if(hg.includes(o.kind)||R("S1",`control kind ${JSON.stringify(o.kind)} is not implemented`),o.kind==="slider"){Rn(n,o.variable,"selector","2.9");let l=it(n,o.variable);l?.kind==="selector"&&l.by==="index"&&R("2.9",`the slider over ${o.variable} needs a selector by nearest, and the selector is by index`),Oc(n,o.domain)}else o.kind==="tabs"?Rn(n,o.variable,"choice","2.9"):o.kind==="toggle"&&Rn(n,o.variable,"toggle","2.9");for(let o of n.readouts??[]){o.place!=="caption"&&o.place!=="panel"&&R("2.9",`readout place ${JSON.stringify(o.place)} is not caption or panel`);for(let l of o.parts)typeof l!="string"&&("var"in l&&Rn(n,l.var,null,"2.9"),"channel"in l&&l.channel===lt&&R("2.9",`a readout channel part names ${lt}, which is not allowed in a readout`),"attr"in l&&(!bn(l.factor??1)||!bn(l.offset??0))&&R("S4","a readout attr part has a factor or offset that is not finite"),"digits"in l&&l.digits!==void 0&&!(Number.isInteger(l.digits)&&l.digits>=1&&l.digits<=17)&&R("2.9",`readout digits is ${String(l.digits)}, not in 1 to 17`))}if(e!==void 0){let o=new _i(n,e);for(let l of Object.keys(n.track_sets)){let c=o.get(l);for(let h of Object.keys(c.def.channels??{}))c.channel(h);for(let h of Object.keys(c.def.parameters??{})){let u=c.parameter(h);for(let f=0;f<c.tracks;f++)Number.isFinite(u[f])||R("2.1",`parameter ${h} of track set ${l} is not finite at track ${f}`)}for(let h of n.clock.channels){if(h===lt||!c.hasChannel(h))continue;let u=c.channel(h);for(let f=0;f<c.tracks;f++){let d=c.start(f),g=c.count(f),y=Math.sign(u[d+1]-u[d]);for(let m=0;m<g;m++)Number.isFinite(u[d+m])||R("T3",`clock channel ${h} of track set ${l} is not finite along track ${f} at sample ${m}`),m+1<g&&!((u[d+m+1]-u[d+m])*y>0)&&R("T3",`clock channel ${h} of track set ${l} is not strictly monotone along track ${f} at sample ${m}`);Number.isFinite(u[d+g-1]-u[d])||R("T3",`clock channel ${h} of track set ${l} has an infinite span along track ${f}`)}}}}for(let o of t===void 0?[n.initial]:[n.initial,t])wg(n,r,o,i);return i}function wg(n,e,t,i){Ar(n,t);for(let l of Xi(t.layout))ld(l,"panel");let r=l=>{l.kind!=="panel"&&(l.ratio>0&&l.ratio<1||R("2.8",`a split ratio is ${String(l.ratio)}, not in (0, 1)`),r(l.a),r(l.b))};r(t.layout);let s=Ot(n.clock),a=(n.readouts??[]).map(l=>({place:l.place,parts:l.parts.filter(c=>typeof c!="string"&&("member"in c||"attr"in c||"channel"in c))})).filter(l=>l.parts.length>0),o=Xi(t.layout)[0];for(let[l,c]of Object.entries(t.panels)){for(let p of Object.keys(c.variables??{})){let b=it(n,p);b!==void 0&&b.scope!=="panel"&&i.push(`panel ${l} sets ${p}, which is scene-scoped and never read there`)}let h=n.views[c.view],u={scene:n,state:t,panel:c},f=qi(u,h),d=(p,b,_,v=e.requirements(b,f))=>{let E=n.track_sets[p],A=[...v.channels].filter(k=>k!==lt&&!Object.hasOwn(E.channels??{},k)),P=[...v.attrs].filter(k=>!Object.hasOwn(E.attrs??{},k));A.length+P.length>0&&R("F5",`panel ${l}: track set ${p} lacks ${[...A.map(k=>`channel ${k}`),...P.map(k=>`attribute ${k}`)].join(", ")} for ${_} in frame ${f}`);for(let k of ud(e,n,b,f)){let w=n.frames[k].scale;w!==void 0&&typeof w=="object"&&"attr"in w&&(w.factor??1)*(E.attrs?.[w.attr]??NaN)+(w.offset??0)===0&&R("F2",`panel ${l}: the scale of frame ${k} is zero for track set ${p}`)}},g=(p,b)=>{let _=n.track_sets[p],v=n.clock.channels.filter(E=>E!==lt&&!Object.hasOwn(_.channels??{},E));v.length>0&&R("C5",`panel ${l}: track set ${p}, ${b}, lacks clock channels ${v.join(", ")}`),s>1&&_.periodic!==!0&&R("C6",`panel ${l}: track set ${p}, ${b}, is not periodic, and the clock has ${s} laps`)},y=(p,b)=>{let _=n.track_sets[p];if(b==="all"||"count"in b)return;if("index"in b){b.index>=_.tracks&&R("V3",`panel ${l}: member index ${b.index} is not below the track count ${_.tracks} of track set ${p}`);return}let v=it(n,b.var);v?.kind==="selector"&&v.by!=="index"&&v.parameter!==void 0&&!Object.hasOwn(_.parameters??{},v.parameter)&&R("V3",`panel ${l}: track set ${p} lacks parameter ${v.parameter} for selector ${b.var}`)},m=rn(u,h.driver.sets);if(m!==null){d(m,n.track_sets[m].frame,"the driver"),g(m,"the driver"),y(m,h.driver.member);let p=n.track_sets[m];for(let b of a)if(b.place==="panel"||l===o)for(let _ of b.parts)"member"in _&&!Object.hasOwn(p.parameters??{},_.member)&&R("2.9",`the ${b.place} readout through panel ${l} names parameter ${_.member}, which track set ${m} lacks`),"attr"in _&&!Object.hasOwn(p.attrs??{},_.attr)&&R("2.9",`the ${b.place} readout through panel ${l} names attribute ${_.attr}, which track set ${m} lacks`),"channel"in _&&!Object.hasOwn(p.channels??{},_.channel)&&R("2.9",`the ${b.place} readout through panel ${l} names channel ${_.channel}, which track set ${m} lacks`)}for(let p of h.layers)if(Rr(u,p))if(p.kind==="track"){let b=rn(u,p.sets);if(b===null)continue;p.context!=="driver"?d(b,n.track_sets[b].frame,"its tracks"):m!==null&&d(m,n.track_sets[b].frame,`a layer of track set ${b} in the driver's context`),y(b,p.members),p.highlight!==void 0&&y(b,{var:p.highlight.var});let _=n.track_sets[b];p.color!==void 0&&typeof p.color=="object"&&("channel"in p.color&&!Object.hasOwn(_.channels??{},p.color.channel)&&R("2.7",`panel ${l}: track set ${b} lacks channel ${p.color.channel} for a layer's color`),"parameter"in p.color&&!Object.hasOwn(_.parameters??{},p.color.parameter)&&R("2.7",`panel ${l}: track set ${b} lacks parameter ${p.color.parameter} for a layer's color`));let v=n.clock.mode==="value"&&(p.before==="hidden"||p.after==="hidden");((p.reveal??"none")!=="none"||bi(p)||v)&&g(b,"on which a reading is taken")}else if(p.kind==="arrow"){let b=rn(u,p.sets);if(b===null)continue;d(b,n.track_sets[b].frame,"its arrows"),y(b,p.members);let _=n.track_sets[b];for(let E of p.vector)E!==lt&&!Object.hasOwn(_.channels??{},E)&&R("L7",`panel ${l}: track set ${b} lacks channel ${E} of an arrow layer's vector`);let v=p.scale;typeof v=="object"&&"attr"in v&&!Object.hasOwn(_.attrs??{},v.attr)&&R("F5",`panel ${l}: track set ${b} lacks attribute ${v.attr} for an arrow layer's scale`),g(b,"on which a reading is taken")}else if(p.kind==="outline"&&m!==null){let b=Fa(u,p.view);b!==null&&d(m,b.frame,`the outline of view ${p.view}`)}else p.kind==="body"&&m!==null&&d(m,n.track_sets[m].frame,`body ${p.body}`,e.bodyRequirements(p.body,f));if(l===o)for(let p of n.controls??[]){if(p.kind!=="slider")continue;let b=it(n,p.variable);if(!(b?.kind!=="selector"||b.parameter===void 0))for(let _ of Cs(u,p.domain))Object.hasOwn(n.track_sets[_].parameters??{},b.parameter)||R("2.9",`the slider over ${p.variable} has track set ${_} in its domain, which lacks parameter ${b.parameter}`)}}}function ud(n,e,t,i,r=[]){let{up:s,down:a}=n.tree.path(t,i),o=new Set;for(let l of[...s,...a]){if(r.includes(l))continue;o.add(l);let c=e.frames[l].origin;if(c!==void 0&&!Array.isArray(c)){let h=e.bodies[c.body];for(let u of ud(n,e,h.frame,e.frames[l].parent,[...r,l]))o.add(u)}}return o}function dd(n,e,t,i){let r=new _i(n,e),s=new vi(n);Ar(n,t);let a=Ot(n.clock),o=t.clock.channel,l=ed(n.clock.steps,i),c=Object.create(null);for(let[h,u]of Object.entries(t.panels)){let f=n.views[u.view],d={scene:n,state:t,panel:u},g=qi(d,f),y=rn(d,f.driver.sets),m=y===null?null:{set:r.get(y),track:0};if(m){m.track=Cr(d,f.driver.member,m.set);let _=n.clock.channels.filter(v=>v!==lt&&!m.set.hasChannel(v));_.length>0&&R("C5",`the driver's track set ${m.set.id} lacks clock channels ${_.join(", ")}`),a>1&&!m.set.periodic&&R("C6",`the driver's track set ${m.set.id} is not periodic, and the clock has ${a} laps`)}let p={scope:d,frames:s,clock:n.clock,channel:o,q:l,display:g},b=[];for(let _ of f.layers)if(["track","arrow","outline","body","axes","grid"].includes(_.kind)||R("S1",`layer kind ${JSON.stringify(_.kind)} is not implemented`),!!Rr(d,_))if(_.kind==="track"){let v=rn(d,_.sets);b.push(sd(p,_,v===null?null:r.get(v),m))}else if(_.kind==="arrow"){let v=rn(d,_.sets);b.push(Va(p,_,v===null?null:r.get(v)))}else _.kind==="outline"?b.push(Ha(p,_,m)):_.kind==="body"?b.push(ad(p,_,m)):b.push({kind:_.kind});c[h]={frame:g,layers:b}}return{panels:c}}var Mg={viridis:[[.267,.005,.329],[.283,.141,.458],[.254,.265,.53],[.207,.372,.553],[.164,.471,.558],[.128,.567,.551],[.135,.659,.518],[.267,.749,.441],[.478,.821,.318],[.741,.873,.15],[.993,.906,.144]],plasma:[[.05,.03,.528],[.294,.012,.615],[.492,.012,.658],[.665,.139,.586],[.798,.28,.47],[.902,.418,.36],[.973,.585,.252],[.993,.771,.155],[.94,.975,.131]],cividis:[[0,.135,.304],[.086,.218,.396],[.243,.301,.42],[.365,.383,.432],[.478,.466,.448],[.588,.55,.437],[.702,.638,.402],[.822,.73,.343],[.945,.827,.244],[.996,.91,.149]],blues:[[.19,.42,.71],[.33,.6,.8],[.53,.76,.87],[.7,.85,.92],[.85,.93,.98]],reds:[[.72,.1,.1],[.89,.27,.2],[.98,.5,.36],[.99,.7,.58],[1,.86,.78]]};function ji(n,e,t=[0,0,0]){let i=Mg[n],r=Math.max(0,Math.min(1,e))*(i.length-1),s=Math.min(i.length-2,Math.floor(r)),a=r-s;for(let o=0;o<3;o++)t[o]=i[s][o]+(i[s+1][o]-i[s][o])*a;return t}function fd(n,e){let[t,i,r]=ji(n,e);return`rgb(${Math.round(t*255)},${Math.round(i*255)},${Math.round(r*255)})`}var Eg={background:"#000000",foreground:"#d8d8d8",grid:"#262626"};function Ir(n){return{...Eg,...n.theme??{}}}var Tg={dark:{background:"#050505",foreground:"#f2f2ef",grid:"#232320"},light:{background:"#faf8f3",foreground:"#141413",grid:"#e3e0d8"}};function Uc(n){let e=n.trim();if(/^#[0-9a-fA-F]{6}$/.test(e))return e.toLowerCase();if(/^#[0-9a-fA-F]{3}$/.test(e))return`#${[...e.slice(1)].map(o=>o+o).join("")}`.toLowerCase();if(e==="")return null;let t=document.createElement("canvas").getContext?.("2d",{willReadFrequently:!0});if(t==null)return null;let i=o=>(t.fillStyle=o,t.fillStyle=e,t.fillStyle);if(i("#000000")!==i("#ffffff"))return null;t.fillRect(0,0,1,1);let[r,s,a]=t.getImageData(0,0,1,1).data;return`#${[r,s,a].map(o=>o.toString(16).padStart(2,"0")).join("")}`}function md(n,e,t){let i=e==="dark"||e==="light"?Tg[e]:n;return{background:Uc(t("--tycho-background"))??i.background,foreground:Uc(t("--tycho-foreground"))??i.foreground,grid:Uc(t("--tycho-grid"))??i.grid}}var Ji={accent:"#f0a050",hover:"#ffb366",press:"#d98a3a",violet:"#c050f0",violetText:"#d98cff",error:"#ff7a7a"};function gd(n){let e=Ut(n.background,n.background,0),t=Ut(n.foreground,n.foreground,0),i=Ut(t,e,.95),r=Et(e).reduce((s,a)=>s+a,0)<1.5;return{"--bg":e,"--fg":t,"--surface":i,"--raised":Ut(t,e,.82),"--line":Ut(t,e,.8),"--dim":Ut(t,e,.287),"--track":Ut(t,e,.574),"--gutter":Ut(t,e,.9),"--head":`${i}cc`,"--accent":Ji.accent,"--accent-hover":Ji.hover,"--accent-press":Ji.press,"--accent-tint":Ut(Ji.accent,i,.84),"--accent-2":Ji.violet,"--accent-2-text":Ji.violetText,"--accent-2-tint":"rgba(192, 80, 240, 0.16)","--error":Ji.error,"--highlight":r?"#ffffff":"#000000"}}function Et(n){let e=/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(n);return e===null?[1,1,1]:[parseInt(e[1],16)/255,parseInt(e[2],16)/255,parseInt(e[3],16)/255]}function Ut(n,e,t){let i=Et(n),r=Et(e),s=a=>Math.round(255*((1-t)*i[a]+t*r[a])).toString(16).padStart(2,"0");return`#${s(0)}${s(1)}${s(2)}`}function pd(n,e,t=[0,1]){let[i,r]=e,s=r===i?.5:Math.min(1,Math.max(0,(n-i)/(r-i)));return t[0]+s*(t[1]-t[0])}function Ag(n){let e=1/0,t=-1/0;for(let i=0;i<n.length;i++){let r=n[i];r<e&&(e=r),r>t&&(t=r)}return e<=t?[e,t]:[0,1]}function Cg(n,e){if(typeof n=="string")return n;let t=e?.(n.var);return(t!==void 0&&Object.hasOwn(n.map,t)?n.map[t]:void 0)??Object.values(n.map).find(r=>r!==void 0)??"viridis"}function Fc(n,e,t){let i="parameter"in n,r="parameter"in n?n.parameter:n.channel,s="parameter"in n?e.parameter(n.parameter,"2.7"):e.channel(n.channel,"2.7");return{id:Cg(n.colormap,t),name:r,perTrack:i,values:s,range:n.range??Ag(s),clip:n.clip??[0,1]}}function yd(n,e,t,i){if(n===void 0)return{kind:"constant",rgb:t};if(typeof n=="string")return{kind:"constant",rgb:Et(n)};let r=Fc(n,e,i),s=new Float32Array(3*e.samples),a=[0,0,0];if(r.perTrack)for(let o=0;o<e.tracks;o++){ji(r.id,pd(r.values[o],r.range,r.clip),a);for(let l=e.start(o);l<e.start(o)+e.count(o);l++)s.set(a,3*l)}else for(let o=0;o<e.samples;o++)s.set(ji(r.id,pd(r.values[o],r.range,r.clip),a),3*o);return{kind:"sample",rgb:s}}function Bc(n,e=12){let t=[],i=[0,0,0];for(let r=0;r<e;r++){let s=r/(e-1);ji(n.id,n.clip[0]+s*(n.clip[1]-n.clip[0]),i),t.push([s,`rgb(${i.map(a=>Math.round(255*a)).join(",")})`])}return t}function vd(n,e=12){return`linear-gradient(to top, ${Bc(n,e).map(([t,i])=>`${i} ${(100*t).toFixed(1)}%`).join(", ")})`}var Jc=(n,e,t)=>{if(!e.has(n))throw TypeError("Cannot "+t)},I=(n,e,t)=>(Jc(n,e,"read from private field"),t?t.call(n):e.get(n)),Ge=(n,e,t)=>{if(e.has(n))throw TypeError("Cannot add the same private member more than once");e instanceof WeakSet?e.add(n):e.set(n,t)},Bt=(n,e,t,i)=>(Jc(n,e,"write to private field"),i?i.call(n,t):e.set(n,t),t),Rg=(n,e,t,i)=>({set _(r){Bt(n,e,r,t)},get _(){return I(n,e,i)}}),je=(n,e,t)=>(Jc(n,e,"access private method"),t),Qe=new Uint8Array(8),$n=new DataView(Qe.buffer),Pt=n=>[(n%256+256)%256],tt=n=>($n.setUint16(0,n,!1),[Qe[0],Qe[1]]),Pg=n=>($n.setInt16(0,n,!1),[Qe[0],Qe[1]]),bd=n=>($n.setUint32(0,n,!1),[Qe[1],Qe[2],Qe[3]]),pe=n=>($n.setUint32(0,n,!1),[Qe[0],Qe[1],Qe[2],Qe[3]]),Ig=n=>($n.setInt32(0,n,!1),[Qe[0],Qe[1],Qe[2],Qe[3]]),nr=n=>($n.setUint32(0,Math.floor(n/2**32),!1),$n.setUint32(4,n,!1),[Qe[0],Qe[1],Qe[2],Qe[3],Qe[4],Qe[5],Qe[6],Qe[7]]),Zc=n=>($n.setInt16(0,2**8*n,!1),[Qe[0],Qe[1]]),Gn=n=>($n.setInt32(0,2**16*n,!1),[Qe[0],Qe[1],Qe[2],Qe[3]]),zc=n=>($n.setInt32(0,2**30*n,!1),[Qe[0],Qe[1],Qe[2],Qe[3]]),_n=(n,e=!1)=>{let t=Array(n.length).fill(null).map((i,r)=>n.charCodeAt(r));return e&&t.push(0),t},Za=n=>n&&n[n.length-1],Kc=n=>{let e;for(let t of n)(!e||t.presentationTimestamp>e.presentationTimestamp)&&(e=t);return e},Wn=(n,e,t=!0)=>{let i=n*e;return t?Math.round(i):i},_d=n=>{let e=n*(Math.PI/180),t=Math.cos(e),i=Math.sin(e);return[t,i,0,-i,t,0,0,0,1]},Sd=_d(0),wd=n=>[Gn(n[0]),Gn(n[1]),zc(n[2]),Gn(n[3]),Gn(n[4]),zc(n[5]),Gn(n[6]),Gn(n[7]),zc(n[8])],ks=n=>!n||typeof n!="object"?n:Array.isArray(n)?n.map(ks):Object.fromEntries(Object.entries(n).map(([e,t])=>[e,ks(t)])),Nr=n=>n>=0&&n<2**32,Tt=(n,e,t)=>({type:n,contents:e&&new Uint8Array(e.flat(10)),children:t}),mt=(n,e,t,i,r)=>Tt(n,[Pt(e),bd(t),i??[]],r),Lg=n=>{let e=512;return n.fragmented?Tt("ftyp",[_n("iso5"),pe(e),_n("iso5"),_n("iso6"),_n("mp41")]):Tt("ftyp",[_n("isom"),pe(e),_n("isom"),n.holdsAvc?_n("avc1"):[],_n("mp41")])},Vc=n=>({type:"mdat",largeSize:n}),Dg=n=>({type:"free",size:n}),Xa=(n,e,t=!1)=>Tt("moov",null,[kg(e,n),...n.map(i=>Ng(i,e)),t?dy(n):null]),kg=(n,e)=>{let t=Wn(Math.max(0,...e.filter(a=>a.samples.length>0).map(a=>{let o=Kc(a.samples);return o.presentationTimestamp+o.duration})),Wc),i=Math.max(...e.map(a=>a.id))+1,r=!Nr(n)||!Nr(t),s=r?nr:pe;return mt("mvhd",+r,0,[s(n),s(n),pe(Wc),s(t),Gn(1),Zc(1),Array(10).fill(0),wd(Sd),Array(24).fill(0),pe(i)])},Ng=(n,e)=>Tt("trak",null,[Og(n,e),Ug(n,e)]),Og=(n,e)=>{let t=Kc(n.samples),i=Wn(t?t.presentationTimestamp+t.duration:0,Wc),r=!Nr(e)||!Nr(i),s=r?nr:pe,a;return n.info.type==="video"?a=typeof n.info.rotation=="number"?_d(n.info.rotation):n.info.rotation:a=Sd,mt("tkhd",+r,3,[s(e),s(e),pe(n.id),pe(0),s(i),Array(8).fill(0),tt(0),tt(0),Zc(n.info.type==="audio"?1:0),tt(0),wd(a),Gn(n.info.type==="video"?n.info.width:0),Gn(n.info.type==="video"?n.info.height:0)])},Ug=(n,e)=>Tt("mdia",null,[Fg(n,e),Bg(n.info.type==="video"?"vide":"soun"),zg(n)]),Fg=(n,e)=>{let t=Kc(n.samples),i=Wn(t?t.presentationTimestamp+t.duration:0,n.timescale),r=!Nr(e)||!Nr(i),s=r?nr:pe;return mt("mdhd",+r,0,[s(e),s(e),pe(n.timescale),s(i),tt(21956),tt(0)])},Bg=n=>mt("hdlr",0,0,[_n("mhlr"),_n(n),pe(0),pe(0),pe(0),_n("mp4-muxer-hdlr",!0)]),zg=n=>Tt("minf",null,[n.info.type==="video"?Vg():Hg(),Gg(),Xg(n)]),Vg=()=>mt("vmhd",0,1,[tt(0),tt(0),tt(0),tt(0)]),Hg=()=>mt("smhd",0,0,[tt(0),tt(0)]),Gg=()=>Tt("dinf",null,[Wg()]),Wg=()=>mt("dref",0,0,[pe(1)],[$g()]),$g=()=>mt("url ",0,1),Xg=n=>{let e=n.compositionTimeOffsetTable.length>1||n.compositionTimeOffsetTable.some(t=>t.sampleCompositionTimeOffset!==0);return Tt("stbl",null,[qg(n),ay(n),oy(n),ly(n),cy(n),hy(n),e?uy(n):null])},qg=n=>mt("stsd",0,0,[pe(1)],[n.info.type==="video"?Yg(Sy[n.info.codec],n):iy(My[n.info.codec],n)]),Yg=(n,e)=>Tt(n,[Array(6).fill(0),tt(1),tt(0),tt(0),Array(12).fill(0),tt(e.info.width),tt(e.info.height),pe(4718592),pe(4718592),pe(0),tt(1),Array(32).fill(0),tt(24),Pg(65535)],[wy[e.info.codec](e),e.info.decoderConfig.colorSpace?Kg(e):null]),jg={bt709:1,bt470bg:5,smpte170m:6},Jg={bt709:1,smpte170m:6,"iec61966-2-1":13},Zg={rgb:0,bt709:1,bt470bg:5,smpte170m:6},Kg=n=>Tt("colr",[_n("nclx"),tt(jg[n.info.decoderConfig.colorSpace.primaries]),tt(Jg[n.info.decoderConfig.colorSpace.transfer]),tt(Zg[n.info.decoderConfig.colorSpace.matrix]),Pt((n.info.decoderConfig.colorSpace.fullRange?1:0)<<7)]),Qg=n=>n.info.decoderConfig&&Tt("avcC",[...new Uint8Array(n.info.decoderConfig.description)]),ey=n=>n.info.decoderConfig&&Tt("hvcC",[...new Uint8Array(n.info.decoderConfig.description)]),ty=n=>{if(!n.info.decoderConfig)return null;let e=n.info.decoderConfig;if(!e.colorSpace)throw new Error("'colorSpace' is required in the decoder config for VP9.");let t=e.codec.split("."),i=Number(t[1]),r=Number(t[2]),o=(Number(t[3])<<4)+(0<<1)+Number(e.colorSpace.fullRange);return mt("vpcC",1,0,[Pt(i),Pt(r),Pt(o),Pt(2),Pt(2),Pt(2),tt(0)])},ny=()=>{let t=(1<<7)+1;return Tt("av1C",[t,0,0,0])},iy=(n,e)=>Tt(n,[Array(6).fill(0),tt(1),tt(0),tt(0),pe(0),tt(e.info.numberOfChannels),tt(16),tt(0),tt(0),Gn(e.info.sampleRate)],[Ey[e.info.codec](e)]),ry=n=>{let e=new Uint8Array(n.info.decoderConfig.description);return mt("esds",0,0,[pe(58753152),Pt(32+e.byteLength),tt(1),Pt(0),pe(75530368),Pt(18+e.byteLength),Pt(64),Pt(21),bd(0),pe(130071),pe(130071),pe(92307584),Pt(e.byteLength),...e,pe(109084800),Pt(1),Pt(2)])},sy=n=>{let e=3840,t=0,i=n.info.decoderConfig?.description;if(i){if(i.byteLength<18)throw new TypeError("Invalid decoder description provided for Opus; must be at least 18 bytes long.");let r=ArrayBuffer.isView(i)?new DataView(i.buffer,i.byteOffset,i.byteLength):new DataView(i);e=r.getUint16(10,!0),t=r.getInt16(14,!0)}return Tt("dOps",[Pt(0),Pt(n.info.numberOfChannels),tt(e),pe(n.info.sampleRate),Zc(t),Pt(0)])},ay=n=>mt("stts",0,0,[pe(n.timeToSampleTable.length),n.timeToSampleTable.map(e=>[pe(e.sampleCount),pe(e.sampleDelta)])]),oy=n=>{if(n.samples.every(t=>t.type==="key"))return null;let e=[...n.samples.entries()].filter(([,t])=>t.type==="key");return mt("stss",0,0,[pe(e.length),e.map(([t])=>pe(t+1))])},ly=n=>mt("stsc",0,0,[pe(n.compactlyCodedChunkTable.length),n.compactlyCodedChunkTable.map(e=>[pe(e.firstChunk),pe(e.samplesPerChunk),pe(1)])]),cy=n=>mt("stsz",0,0,[pe(0),pe(n.samples.length),n.samples.map(e=>pe(e.size))]),hy=n=>n.finalizedChunks.length>0&&Za(n.finalizedChunks).offset>=2**32?mt("co64",0,0,[pe(n.finalizedChunks.length),n.finalizedChunks.map(e=>nr(e.offset))]):mt("stco",0,0,[pe(n.finalizedChunks.length),n.finalizedChunks.map(e=>pe(e.offset))]),uy=n=>mt("ctts",0,0,[pe(n.compositionTimeOffsetTable.length),n.compositionTimeOffsetTable.map(e=>[pe(e.sampleCount),pe(e.sampleCompositionTimeOffset)])]),dy=n=>Tt("mvex",null,n.map(fy)),fy=n=>mt("trex",0,0,[pe(n.id),pe(1),pe(0),pe(0),pe(0)]),xd=(n,e)=>Tt("moof",null,[py(n),...e.map(my)]),py=n=>mt("mfhd",0,0,[pe(n)]),Md=n=>{let e=0,t=0,i=0,r=0,s=n.type==="delta";return t|=+s,s?e|=1:e|=2,e<<24|t<<16|i<<8|r},my=n=>Tt("traf",null,[gy(n),yy(n),vy(n)]),gy=n=>{let e=0;e|=8,e|=16,e|=32,e|=131072;let t=n.currentChunk.samples[1]??n.currentChunk.samples[0],i={duration:t.timescaleUnitsToNextSample,size:t.size,flags:Md(t)};return mt("tfhd",0,e,[pe(n.id),pe(i.duration),pe(i.size),pe(i.flags)])},yy=n=>mt("tfdt",1,0,[nr(Wn(n.currentChunk.startTimestamp,n.timescale))]),vy=n=>{let e=n.currentChunk.samples.map(y=>y.timescaleUnitsToNextSample),t=n.currentChunk.samples.map(y=>y.size),i=n.currentChunk.samples.map(Md),r=n.currentChunk.samples.map(y=>Wn(y.presentationTimestamp-y.decodeTimestamp,n.timescale)),s=new Set(e),a=new Set(t),o=new Set(i),l=new Set(r),c=o.size===2&&i[0]!==i[1],h=s.size>1,u=a.size>1,f=!c&&o.size>1,d=l.size>1||[...l].some(y=>y!==0),g=0;return g|=1,g|=4*+c,g|=256*+h,g|=512*+u,g|=1024*+f,g|=2048*+d,mt("trun",1,g,[pe(n.currentChunk.samples.length),pe(n.currentChunk.offset-n.currentChunk.moofOffset||0),c?pe(i[0]):[],n.currentChunk.samples.map((y,m)=>[h?pe(e[m]):[],u?pe(t[m]):[],f?pe(i[m]):[],d?Ig(r[m]):[]])])},xy=n=>Tt("mfra",null,[...n.map(by),_y()]),by=(n,e)=>mt("tfra",1,0,[pe(n.id),pe(63),pe(n.finalizedChunks.length),n.finalizedChunks.map(i=>[nr(Wn(i.startTimestamp,n.timescale)),nr(i.moofOffset),pe(e+1),pe(1),pe(1)])]),_y=()=>mt("mfro",0,0,[pe(0)]),Sy={avc:"avc1",hevc:"hvc1",vp9:"vp09",av1:"av01"},wy={avc:Qg,hevc:ey,vp9:ty,av1:ny},My={aac:"mp4a",opus:"Opus"},Ey={aac:ry,opus:sy};var io=class{},Qc=class extends io{constructor(){super(...arguments),this.buffer=null}},Ed=class extends io{constructor(n){if(super(),this.options=n,typeof n!="object")throw new TypeError("StreamTarget requires an options object to be passed to its constructor.");if(n.onData){if(typeof n.onData!="function")throw new TypeError("options.onData, when provided, must be a function.");if(n.onData.length<2)throw new TypeError("options.onData, when provided, must be a function that takes in at least two arguments (data and position). Ignoring the position argument, which specifies the byte offset at which the data is to be written, can lead to broken outputs.")}if(n.chunked!==void 0&&typeof n.chunked!="boolean")throw new TypeError("options.chunked, when provided, must be a boolean.");if(n.chunkSize!==void 0&&(!Number.isInteger(n.chunkSize)||n.chunkSize<1024))throw new TypeError("options.chunkSize, when provided, must be an integer and not smaller than 1024.")}},Ty=class extends io{constructor(n,e){if(super(),this.stream=n,this.options=e,!(n instanceof FileSystemWritableFileStream))throw new TypeError("FileSystemWritableFileStreamTarget requires a FileSystemWritableFileStream instance.");if(e!==void 0&&typeof e!="object")throw new TypeError("FileSystemWritableFileStreamTarget's options, when provided, must be an object.");if(e&&e.chunkSize!==void 0&&(!Number.isInteger(e.chunkSize)||e.chunkSize<=0))throw new TypeError("options.chunkSize, when provided, must be a positive integer")}},Zi,Lr,Td=class{constructor(){this.pos=0,Ge(this,Zi,new Uint8Array(8)),Ge(this,Lr,new DataView(I(this,Zi).buffer)),this.offsets=new WeakMap}seek(n){this.pos=n}writeU32(n){I(this,Lr).setUint32(0,n,!1),this.write(I(this,Zi).subarray(0,4))}writeU64(n){I(this,Lr).setUint32(0,Math.floor(n/2**32),!1),I(this,Lr).setUint32(4,n,!1),this.write(I(this,Zi).subarray(0,8))}writeAscii(n){for(let e=0;e<n.length;e++)I(this,Lr).setUint8(e%8,n.charCodeAt(e)),e%8===7&&this.write(I(this,Zi));n.length%8!==0&&this.write(I(this,Zi).subarray(0,n.length%8))}writeBox(n){if(this.offsets.set(n,this.pos),n.contents&&!n.children)this.writeBoxHeader(n,n.size??n.contents.byteLength+8),this.write(n.contents);else{let e=this.pos;if(this.writeBoxHeader(n,0),n.contents&&this.write(n.contents),n.children)for(let r of n.children)r&&this.writeBox(r);let t=this.pos,i=n.size??t-e;this.seek(e),this.writeBoxHeader(n,i),this.seek(t)}}writeBoxHeader(n,e){this.writeU32(n.largeSize?1:e),this.writeAscii(n.type),n.largeSize&&this.writeU64(e)}measureBoxHeader(n){return 8+(n.largeSize?8:0)}patchBox(n){let e=this.pos;this.seek(this.offsets.get(n)),this.writeBox(n),this.seek(e)}measureBox(n){if(n.contents&&!n.children)return this.measureBoxHeader(n)+n.contents.byteLength;{let e=this.measureBoxHeader(n);if(n.contents&&(e+=n.contents.byteLength),n.children)for(let t of n.children)t&&(e+=this.measureBox(t));return e}}};Zi=new WeakMap;Lr=new WeakMap;var qa,tr,Bs,Ls,Ya,Hc,Ay=class extends Td{constructor(n){super(),Ge(this,Ya),Ge(this,qa,void 0),Ge(this,tr,new ArrayBuffer(2**16)),Ge(this,Bs,new Uint8Array(I(this,tr))),Ge(this,Ls,0),Bt(this,qa,n)}write(n){je(this,Ya,Hc).call(this,this.pos+n.byteLength),I(this,Bs).set(n,this.pos),this.pos+=n.byteLength,Bt(this,Ls,Math.max(I(this,Ls),this.pos))}finalize(){je(this,Ya,Hc).call(this,this.pos),I(this,qa).buffer=I(this,tr).slice(0,Math.max(I(this,Ls),this.pos))}};qa=new WeakMap;tr=new WeakMap;Bs=new WeakMap;Ls=new WeakMap;Ya=new WeakSet;Hc=function(n){let e=I(this,tr).byteLength;for(;e<n;)e*=2;if(e===I(this,tr).byteLength)return;let t=new ArrayBuffer(e),i=new Uint8Array(t);i.set(I(this,Bs),0),Bt(this,tr,t),Bt(this,Bs,i)};var Cy=2**24,Ry=2,Ns,Ki,Ds,ni,dn,Ka,Gc,eh,Ad,th,Cd,Os,Qa,nh=class extends Td{constructor(n){super(),Ge(this,Ka),Ge(this,eh),Ge(this,th),Ge(this,Os),Ge(this,Ns,void 0),Ge(this,Ki,[]),Ge(this,Ds,void 0),Ge(this,ni,void 0),Ge(this,dn,[]),Bt(this,Ns,n),Bt(this,Ds,n.options?.chunked??!1),Bt(this,ni,n.options?.chunkSize??Cy)}write(n){I(this,Ki).push({data:n.slice(),start:this.pos}),this.pos+=n.byteLength}flush(){if(I(this,Ki).length===0)return;let n=[],e=[...I(this,Ki)].sort((t,i)=>t.start-i.start);n.push({start:e[0].start,size:e[0].data.byteLength});for(let t=1;t<e.length;t++){let i=n[n.length-1],r=e[t];r.start<=i.start+i.size?i.size=Math.max(i.size,r.start+r.data.byteLength-i.start):n.push({start:r.start,size:r.data.byteLength})}for(let t of n){t.data=new Uint8Array(t.size);for(let i of I(this,Ki))t.start<=i.start&&i.start<t.start+t.size&&t.data.set(i.data,i.start-t.start);I(this,Ds)?(je(this,Ka,Gc).call(this,t.data,t.start),je(this,Os,Qa).call(this)):I(this,Ns).options.onData?.(t.data,t.start)}I(this,Ki).length=0}finalize(){I(this,Ds)&&je(this,Os,Qa).call(this,!0)}};Ns=new WeakMap;Ki=new WeakMap;Ds=new WeakMap;ni=new WeakMap;dn=new WeakMap;Ka=new WeakSet;Gc=function(n,e){let t=I(this,dn).findIndex(o=>o.start<=e&&e<o.start+I(this,ni));t===-1&&(t=je(this,th,Cd).call(this,e));let i=I(this,dn)[t],r=e-i.start,s=n.subarray(0,Math.min(I(this,ni)-r,n.byteLength));i.data.set(s,r);let a={start:r,end:r+s.byteLength};if(je(this,eh,Ad).call(this,i,a),i.written[0].start===0&&i.written[0].end===I(this,ni)&&(i.shouldFlush=!0),I(this,dn).length>Ry){for(let o=0;o<I(this,dn).length-1;o++)I(this,dn)[o].shouldFlush=!0;je(this,Os,Qa).call(this)}s.byteLength<n.byteLength&&je(this,Ka,Gc).call(this,n.subarray(s.byteLength),e+s.byteLength)};eh=new WeakSet;Ad=function(n,e){let t=0,i=n.written.length-1,r=-1;for(;t<=i;){let s=Math.floor(t+(i-t+1)/2);n.written[s].start<=e.start?(t=s+1,r=s):i=s-1}for(n.written.splice(r+1,0,e),(r===-1||n.written[r].end<e.start)&&r++;r<n.written.length-1&&n.written[r].end>=n.written[r+1].start;)n.written[r].end=Math.max(n.written[r].end,n.written[r+1].end),n.written.splice(r+1,1)};th=new WeakSet;Cd=function(n){let t={start:Math.floor(n/I(this,ni))*I(this,ni),data:new Uint8Array(I(this,ni)),written:[],shouldFlush:!1};return I(this,dn).push(t),I(this,dn).sort((i,r)=>i.start-r.start),I(this,dn).indexOf(t)};Os=new WeakSet;Qa=function(n=!1){for(let e=0;e<I(this,dn).length;e++){let t=I(this,dn)[e];if(!(!t.shouldFlush&&!n)){for(let i of t.written)I(this,Ns).options.onData?.(t.data.subarray(i.start,i.end),t.start+i.start);I(this,dn).splice(e--,1)}}};var Py=class extends nh{constructor(n){super(new Ed({onData:(e,t)=>n.stream.write({type:"write",data:e,position:t}),chunked:!0,chunkSize:n.options?.chunkSize}))}},Wc=1e3,Iy=["avc","hevc","vp9","av1"],Ly=["aac","opus"],Dy=2082844800,ky=["strict","offset","cross-track-offset"],Ce,ke,eo,un,Wt,Ft,Dr,kr,ih,Qi,er,Us,$c,Rd,Xc,Pd,rh,Id,qc,Ld,sh,Dd,ja,Yc,Hn,ti,ah,kd,Fs,to,no,oh,Or,zs,Ja,jc,Nd=class{constructor(n){if(Ge(this,$c),Ge(this,Xc),Ge(this,rh),Ge(this,qc),Ge(this,sh),Ge(this,ja),Ge(this,Hn),Ge(this,ah),Ge(this,Fs),Ge(this,no),Ge(this,Or),Ge(this,Ja),Ge(this,Ce,void 0),Ge(this,ke,void 0),Ge(this,eo,void 0),Ge(this,un,void 0),Ge(this,Wt,null),Ge(this,Ft,null),Ge(this,Dr,Math.floor(Date.now()/1e3)+Dy),Ge(this,kr,[]),Ge(this,ih,1),Ge(this,Qi,[]),Ge(this,er,[]),Ge(this,Us,!1),je(this,$c,Rd).call(this,n),n.video=ks(n.video),n.audio=ks(n.audio),n.fastStart=ks(n.fastStart),this.target=n.target,Bt(this,Ce,{firstTimestampBehavior:"strict",...n}),n.target instanceof Qc)Bt(this,ke,new Ay(n.target));else if(n.target instanceof Ed)Bt(this,ke,new nh(n.target));else if(n.target instanceof Ty)Bt(this,ke,new Py(n.target));else throw new Error(`Invalid target: ${n.target}`);je(this,qc,Ld).call(this),je(this,Xc,Pd).call(this)}addVideoChunk(n,e,t,i){if(!(n instanceof EncodedVideoChunk))throw new TypeError("addVideoChunk's first argument (sample) must be of type EncodedVideoChunk.");if(e&&typeof e!="object")throw new TypeError("addVideoChunk's second argument (meta), when provided, must be an object.");if(t!==void 0&&(!Number.isFinite(t)||t<0))throw new TypeError("addVideoChunk's third argument (timestamp), when provided, must be a non-negative real number.");if(i!==void 0&&!Number.isFinite(i))throw new TypeError("addVideoChunk's fourth argument (compositionTimeOffset), when provided, must be a real number.");let r=new Uint8Array(n.byteLength);n.copyTo(r),this.addVideoChunkRaw(r,n.type,t??n.timestamp,n.duration,e,i)}addVideoChunkRaw(n,e,t,i,r,s){if(!(n instanceof Uint8Array))throw new TypeError("addVideoChunkRaw's first argument (data) must be an instance of Uint8Array.");if(e!=="key"&&e!=="delta")throw new TypeError("addVideoChunkRaw's second argument (type) must be either 'key' or 'delta'.");if(!Number.isFinite(t)||t<0)throw new TypeError("addVideoChunkRaw's third argument (timestamp) must be a non-negative real number.");if(!Number.isFinite(i)||i<0)throw new TypeError("addVideoChunkRaw's fourth argument (duration) must be a non-negative real number.");if(r&&typeof r!="object")throw new TypeError("addVideoChunkRaw's fifth argument (meta), when provided, must be an object.");if(s!==void 0&&!Number.isFinite(s))throw new TypeError("addVideoChunkRaw's sixth argument (compositionTimeOffset), when provided, must be a real number.");if(je(this,Ja,jc).call(this),!I(this,Ce).video)throw new Error("No video track declared.");if(typeof I(this,Ce).fastStart=="object"&&I(this,Wt).samples.length===I(this,Ce).fastStart.expectedVideoChunks)throw new Error(`Cannot add more video chunks than specified in 'fastStart' (${I(this,Ce).fastStart.expectedVideoChunks}).`);let a=je(this,ja,Yc).call(this,I(this,Wt),n,e,t,i,r,s);if(I(this,Ce).fastStart==="fragmented"&&I(this,Ft)){for(;I(this,er).length>0&&I(this,er)[0].decodeTimestamp<=a.decodeTimestamp;){let o=I(this,er).shift();je(this,Hn,ti).call(this,I(this,Ft),o)}a.decodeTimestamp<=I(this,Ft).lastDecodeTimestamp?je(this,Hn,ti).call(this,I(this,Wt),a):I(this,Qi).push(a)}else je(this,Hn,ti).call(this,I(this,Wt),a)}addAudioChunk(n,e,t){if(!(n instanceof EncodedAudioChunk))throw new TypeError("addAudioChunk's first argument (sample) must be of type EncodedAudioChunk.");if(e&&typeof e!="object")throw new TypeError("addAudioChunk's second argument (meta), when provided, must be an object.");if(t!==void 0&&(!Number.isFinite(t)||t<0))throw new TypeError("addAudioChunk's third argument (timestamp), when provided, must be a non-negative real number.");let i=new Uint8Array(n.byteLength);n.copyTo(i),this.addAudioChunkRaw(i,n.type,t??n.timestamp,n.duration,e)}addAudioChunkRaw(n,e,t,i,r){if(!(n instanceof Uint8Array))throw new TypeError("addAudioChunkRaw's first argument (data) must be an instance of Uint8Array.");if(e!=="key"&&e!=="delta")throw new TypeError("addAudioChunkRaw's second argument (type) must be either 'key' or 'delta'.");if(!Number.isFinite(t)||t<0)throw new TypeError("addAudioChunkRaw's third argument (timestamp) must be a non-negative real number.");if(!Number.isFinite(i)||i<0)throw new TypeError("addAudioChunkRaw's fourth argument (duration) must be a non-negative real number.");if(r&&typeof r!="object")throw new TypeError("addAudioChunkRaw's fifth argument (meta), when provided, must be an object.");if(je(this,Ja,jc).call(this),!I(this,Ce).audio)throw new Error("No audio track declared.");if(typeof I(this,Ce).fastStart=="object"&&I(this,Ft).samples.length===I(this,Ce).fastStart.expectedAudioChunks)throw new Error(`Cannot add more audio chunks than specified in 'fastStart' (${I(this,Ce).fastStart.expectedAudioChunks}).`);let s=je(this,ja,Yc).call(this,I(this,Ft),n,e,t,i,r);if(I(this,Ce).fastStart==="fragmented"&&I(this,Wt)){for(;I(this,Qi).length>0&&I(this,Qi)[0].decodeTimestamp<=s.decodeTimestamp;){let a=I(this,Qi).shift();je(this,Hn,ti).call(this,I(this,Wt),a)}s.decodeTimestamp<=I(this,Wt).lastDecodeTimestamp?je(this,Hn,ti).call(this,I(this,Ft),s):I(this,er).push(s)}else je(this,Hn,ti).call(this,I(this,Ft),s)}finalize(){if(I(this,Us))throw new Error("Cannot finalize a muxer more than once.");if(I(this,Ce).fastStart==="fragmented"){for(let e of I(this,Qi))je(this,Hn,ti).call(this,I(this,Wt),e);for(let e of I(this,er))je(this,Hn,ti).call(this,I(this,Ft),e);je(this,no,oh).call(this,!1)}else I(this,Wt)&&je(this,Fs,to).call(this,I(this,Wt)),I(this,Ft)&&je(this,Fs,to).call(this,I(this,Ft));let n=[I(this,Wt),I(this,Ft)].filter(Boolean);if(I(this,Ce).fastStart==="in-memory"){let e;for(let i=0;i<2;i++){let r=Xa(n,I(this,Dr)),s=I(this,ke).measureBox(r);e=I(this,ke).measureBox(I(this,un));let a=I(this,ke).pos+s+e;for(let o of I(this,kr)){o.offset=a;for(let{data:l}of o.samples)a+=l.byteLength,e+=l.byteLength}if(a<2**32)break;e>=2**32&&(I(this,un).largeSize=!0)}let t=Xa(n,I(this,Dr));I(this,ke).writeBox(t),I(this,un).size=e,I(this,ke).writeBox(I(this,un));for(let i of I(this,kr))for(let r of i.samples)I(this,ke).write(r.data),r.data=null}else if(I(this,Ce).fastStart==="fragmented"){let e=I(this,ke).pos,t=xy(n);I(this,ke).writeBox(t);let i=I(this,ke).pos-e;I(this,ke).seek(I(this,ke).pos-4),I(this,ke).writeU32(i)}else{let e=I(this,ke).offsets.get(I(this,un)),t=I(this,ke).pos-e;I(this,un).size=t,I(this,un).largeSize=t>=2**32,I(this,ke).patchBox(I(this,un));let i=Xa(n,I(this,Dr));if(typeof I(this,Ce).fastStart=="object"){I(this,ke).seek(I(this,eo)),I(this,ke).writeBox(i);let r=e-I(this,ke).pos;I(this,ke).writeBox(Dg(r))}else I(this,ke).writeBox(i)}je(this,Or,zs).call(this),I(this,ke).finalize(),Bt(this,Us,!0)}};Ce=new WeakMap;ke=new WeakMap;eo=new WeakMap;un=new WeakMap;Wt=new WeakMap;Ft=new WeakMap;Dr=new WeakMap;kr=new WeakMap;ih=new WeakMap;Qi=new WeakMap;er=new WeakMap;Us=new WeakMap;$c=new WeakSet;Rd=function(n){if(typeof n!="object")throw new TypeError("The muxer requires an options object to be passed to its constructor.");if(!(n.target instanceof io))throw new TypeError("The target must be provided and an instance of Target.");if(n.video){if(!Iy.includes(n.video.codec))throw new TypeError(`Unsupported video codec: ${n.video.codec}`);if(!Number.isInteger(n.video.width)||n.video.width<=0)throw new TypeError(`Invalid video width: ${n.video.width}. Must be a positive integer.`);if(!Number.isInteger(n.video.height)||n.video.height<=0)throw new TypeError(`Invalid video height: ${n.video.height}. Must be a positive integer.`);let e=n.video.rotation;if(typeof e=="number"&&![0,90,180,270].includes(e))throw new TypeError(`Invalid video rotation: ${e}. Has to be 0, 90, 180 or 270.`);if(Array.isArray(e)&&(e.length!==9||e.some(t=>typeof t!="number")))throw new TypeError(`Invalid video transformation matrix: ${e.join()}`);if(n.video.frameRate!==void 0&&(!Number.isInteger(n.video.frameRate)||n.video.frameRate<=0))throw new TypeError(`Invalid video frame rate: ${n.video.frameRate}. Must be a positive integer.`)}if(n.audio){if(!Ly.includes(n.audio.codec))throw new TypeError(`Unsupported audio codec: ${n.audio.codec}`);if(!Number.isInteger(n.audio.numberOfChannels)||n.audio.numberOfChannels<=0)throw new TypeError(`Invalid number of audio channels: ${n.audio.numberOfChannels}. Must be a positive integer.`);if(!Number.isInteger(n.audio.sampleRate)||n.audio.sampleRate<=0)throw new TypeError(`Invalid audio sample rate: ${n.audio.sampleRate}. Must be a positive integer.`)}if(n.firstTimestampBehavior&&!ky.includes(n.firstTimestampBehavior))throw new TypeError(`Invalid first timestamp behavior: ${n.firstTimestampBehavior}`);if(typeof n.fastStart=="object"){if(n.video){if(n.fastStart.expectedVideoChunks===void 0)throw new TypeError("'fastStart' is an object but is missing property 'expectedVideoChunks'.");if(!Number.isInteger(n.fastStart.expectedVideoChunks)||n.fastStart.expectedVideoChunks<0)throw new TypeError("'expectedVideoChunks' must be a non-negative integer.")}if(n.audio){if(n.fastStart.expectedAudioChunks===void 0)throw new TypeError("'fastStart' is an object but is missing property 'expectedAudioChunks'.");if(!Number.isInteger(n.fastStart.expectedAudioChunks)||n.fastStart.expectedAudioChunks<0)throw new TypeError("'expectedAudioChunks' must be a non-negative integer.")}}else if(![!1,"in-memory","fragmented"].includes(n.fastStart))throw new TypeError("'fastStart' option must be false, 'in-memory', 'fragmented' or an object.");if(n.minFragmentDuration!==void 0&&(!Number.isFinite(n.minFragmentDuration)||n.minFragmentDuration<0))throw new TypeError("'minFragmentDuration' must be a non-negative number.")};Xc=new WeakSet;Pd=function(){if(I(this,ke).writeBox(Lg({holdsAvc:I(this,Ce).video?.codec==="avc",fragmented:I(this,Ce).fastStart==="fragmented"})),Bt(this,eo,I(this,ke).pos),I(this,Ce).fastStart==="in-memory")Bt(this,un,Vc(!1));else if(I(this,Ce).fastStart!=="fragmented"){if(typeof I(this,Ce).fastStart=="object"){let n=je(this,rh,Id).call(this);I(this,ke).seek(I(this,ke).pos+n)}Bt(this,un,Vc(!0)),I(this,ke).writeBox(I(this,un))}je(this,Or,zs).call(this)};rh=new WeakSet;Id=function(){if(typeof I(this,Ce).fastStart!="object")return;let n=0,e=[I(this,Ce).fastStart.expectedVideoChunks,I(this,Ce).fastStart.expectedAudioChunks];for(let t of e)t&&(n+=8*Math.ceil(2/3*t),n+=4*t,n+=12*Math.ceil(2/3*t),n+=4*t,n+=8*t);return n+=4096,n};qc=new WeakSet;Ld=function(){if(I(this,Ce).video&&Bt(this,Wt,{id:1,info:{type:"video",codec:I(this,Ce).video.codec,width:I(this,Ce).video.width,height:I(this,Ce).video.height,rotation:I(this,Ce).video.rotation??0,decoderConfig:null},timescale:I(this,Ce).video.frameRate??57600,samples:[],finalizedChunks:[],currentChunk:null,firstDecodeTimestamp:void 0,lastDecodeTimestamp:-1,timeToSampleTable:[],compositionTimeOffsetTable:[],lastTimescaleUnits:null,lastSample:null,compactlyCodedChunkTable:[]}),I(this,Ce).audio&&(Bt(this,Ft,{id:I(this,Ce).video?2:1,info:{type:"audio",codec:I(this,Ce).audio.codec,numberOfChannels:I(this,Ce).audio.numberOfChannels,sampleRate:I(this,Ce).audio.sampleRate,decoderConfig:null},timescale:I(this,Ce).audio.sampleRate,samples:[],finalizedChunks:[],currentChunk:null,firstDecodeTimestamp:void 0,lastDecodeTimestamp:-1,timeToSampleTable:[],compositionTimeOffsetTable:[],lastTimescaleUnits:null,lastSample:null,compactlyCodedChunkTable:[]}),I(this,Ce).audio.codec==="aac")){let n=je(this,sh,Dd).call(this,2,I(this,Ce).audio.sampleRate,I(this,Ce).audio.numberOfChannels);I(this,Ft).info.decoderConfig={codec:I(this,Ce).audio.codec,description:n,numberOfChannels:I(this,Ce).audio.numberOfChannels,sampleRate:I(this,Ce).audio.sampleRate}}};sh=new WeakSet;Dd=function(n,e,t){let r=[96e3,88200,64e3,48e3,44100,32e3,24e3,22050,16e3,12e3,11025,8e3,7350].indexOf(e),s=t,a="";a+=n.toString(2).padStart(5,"0"),a+=r.toString(2).padStart(4,"0"),r===15&&(a+=e.toString(2).padStart(24,"0")),a+=s.toString(2).padStart(4,"0");let o=Math.ceil(a.length/8)*8;a=a.padEnd(o,"0");let l=new Uint8Array(a.length/8);for(let c=0;c<a.length;c+=8)l[c/8]=parseInt(a.slice(c,c+8),2);return l};ja=new WeakSet;Yc=function(n,e,t,i,r,s,a){let o=i/1e6,l=(i-(a??0))/1e6,c=r/1e6,h=je(this,ah,kd).call(this,o,l,n);return o=h.presentationTimestamp,l=h.decodeTimestamp,s?.decoderConfig&&(n.info.decoderConfig===null?n.info.decoderConfig=s.decoderConfig:Object.assign(n.info.decoderConfig,s.decoderConfig)),{presentationTimestamp:o,decodeTimestamp:l,duration:c,data:e,size:e.byteLength,type:t,timescaleUnitsToNextSample:Wn(c,n.timescale)}};Hn=new WeakSet;ti=function(n,e){I(this,Ce).fastStart!=="fragmented"&&n.samples.push(e);let t=Wn(e.presentationTimestamp-e.decodeTimestamp,n.timescale);if(n.lastTimescaleUnits!==null){let r=Wn(e.decodeTimestamp,n.timescale,!1),s=Math.round(r-n.lastTimescaleUnits);if(n.lastTimescaleUnits+=s,n.lastSample.timescaleUnitsToNextSample=s,I(this,Ce).fastStart!=="fragmented"){let a=Za(n.timeToSampleTable);a.sampleCount===1?(a.sampleDelta=s,a.sampleCount++):a.sampleDelta===s?a.sampleCount++:(a.sampleCount--,n.timeToSampleTable.push({sampleCount:2,sampleDelta:s}));let o=Za(n.compositionTimeOffsetTable);o.sampleCompositionTimeOffset===t?o.sampleCount++:n.compositionTimeOffsetTable.push({sampleCount:1,sampleCompositionTimeOffset:t})}}else n.lastTimescaleUnits=0,I(this,Ce).fastStart!=="fragmented"&&(n.timeToSampleTable.push({sampleCount:1,sampleDelta:Wn(e.duration,n.timescale)}),n.compositionTimeOffsetTable.push({sampleCount:1,sampleCompositionTimeOffset:t}));n.lastSample=e;let i=!1;if(!n.currentChunk)i=!0;else{let r=e.presentationTimestamp-n.currentChunk.startTimestamp;if(I(this,Ce).fastStart==="fragmented"){let s=I(this,Wt)??I(this,Ft),a=I(this,Ce).minFragmentDuration??1;n===s&&e.type==="key"&&r>=a&&(i=!0,je(this,no,oh).call(this))}else i=r>=.5}i&&(n.currentChunk&&je(this,Fs,to).call(this,n),n.currentChunk={startTimestamp:e.presentationTimestamp,samples:[]}),n.currentChunk.samples.push(e)};ah=new WeakSet;kd=function(n,e,t){let i=I(this,Ce).firstTimestampBehavior==="strict",r=t.lastDecodeTimestamp===-1;if(i&&r&&e!==0)throw new Error(`The first chunk for your media track must have a timestamp of 0 (received DTS=${e}).Non-zero first timestamps are often caused by directly piping frames or audio data from a MediaStreamTrack into the encoder. Their timestamps are typically relative to the age of thedocument, which is probably what you want.

If you want to offset all timestamps of a track such that the first one is zero, set firstTimestampBehavior: 'offset' in the options.
`);if(I(this,Ce).firstTimestampBehavior==="offset"||I(this,Ce).firstTimestampBehavior==="cross-track-offset"){t.firstDecodeTimestamp===void 0&&(t.firstDecodeTimestamp=e);let a;I(this,Ce).firstTimestampBehavior==="offset"?a=t.firstDecodeTimestamp:a=Math.min(I(this,Wt)?.firstDecodeTimestamp??1/0,I(this,Ft)?.firstDecodeTimestamp??1/0),e-=a,n-=a}if(e<t.lastDecodeTimestamp)throw new Error(`Timestamps must be monotonically increasing (DTS went from ${t.lastDecodeTimestamp*1e6} to ${e*1e6}).`);return t.lastDecodeTimestamp=e,{presentationTimestamp:n,decodeTimestamp:e}};Fs=new WeakSet;to=function(n){if(I(this,Ce).fastStart==="fragmented")throw new Error("Can't finalize individual chunks if 'fastStart' is set to 'fragmented'.");if(n.currentChunk){if(n.finalizedChunks.push(n.currentChunk),I(this,kr).push(n.currentChunk),(n.compactlyCodedChunkTable.length===0||Za(n.compactlyCodedChunkTable).samplesPerChunk!==n.currentChunk.samples.length)&&n.compactlyCodedChunkTable.push({firstChunk:n.finalizedChunks.length,samplesPerChunk:n.currentChunk.samples.length}),I(this,Ce).fastStart==="in-memory"){n.currentChunk.offset=0;return}n.currentChunk.offset=I(this,ke).pos;for(let e of n.currentChunk.samples)I(this,ke).write(e.data),e.data=null;je(this,Or,zs).call(this)}};no=new WeakSet;oh=function(n=!0){if(I(this,Ce).fastStart!=="fragmented")throw new Error("Can't finalize a fragment unless 'fastStart' is set to 'fragmented'.");let e=[I(this,Wt),I(this,Ft)].filter(o=>o&&o.currentChunk);if(e.length===0)return;let t=Rg(this,ih)._++;if(t===1){let o=Xa(e,I(this,Dr),!0);I(this,ke).writeBox(o)}let i=I(this,ke).pos,r=xd(t,e);I(this,ke).writeBox(r);{let o=Vc(!1),l=0;for(let h of e)for(let u of h.currentChunk.samples)l+=u.size;let c=I(this,ke).measureBox(o)+l;c>=2**32&&(o.largeSize=!0,c=I(this,ke).measureBox(o)+l),o.size=c,I(this,ke).writeBox(o)}for(let o of e){o.currentChunk.offset=I(this,ke).pos,o.currentChunk.moofOffset=i;for(let l of o.currentChunk.samples)I(this,ke).write(l.data),l.data=null}let s=I(this,ke).pos;I(this,ke).seek(I(this,ke).offsets.get(r));let a=xd(t,e);I(this,ke).writeBox(a),I(this,ke).seek(s);for(let o of e)o.finalizedChunks.push(o.currentChunk),I(this,kr).push(o.currentChunk),o.currentChunk=null;n&&je(this,Or,zs).call(this)};Or=new WeakSet;zs=function(){I(this,ke)instanceof nh&&I(this,ke).flush()};Ja=new WeakSet;jc=function(){if(I(this,Us))throw new Error("Cannot add new video or audio chunks after the file has been finalized.")};function uh(n){return(n.lap??0)-(n.shifted?1:0)}var lh=class{set;frame;laps;top;invariant;frames;stores=new Map;box=null;constructor(e,t,i,r=1){this.set=e,this.frame=t,this.frames=i,this.laps=e.periodic?r:1,this.top=this.laps-1,this.invariant=i.requirements(e.def.frame,t).channels.size===0}storeLap(e){return this.invariant?0:e}lapKey(e){return this.invariant?e<this.top?"joined":"top":String(e)}store(e){let t=this.storeLap(e),i=this.stores.get(t);return i===void 0&&(i={buf:new Float64Array(3*this.set.samples),done:new Uint8Array(this.set.tracks),all:!1},this.stores.set(t,i)),i}ensure(e,t){let i=Ny(t),r=this.store(i);if(r.done[e]===1)return r.buf;let s=this.set,a=this.storeLap(i),o=s.start(e);for(let l=0;l<s.count(e);l++)r.buf.set(this.frames.transform(s.position(e,l),s.def.frame,this.frame,{set:s,track:e,sample:l,shifted:!1,lap:a}),3*(o+l));return r.done[e]=1,r.buf}lapPositions(e){let t=this.store(e);if(!t.all){for(let i=0;i<this.set.tracks;i++)this.ensure(i,e);t.all=!0}return t.buf}get positions(){return this.lapPositions(0)}get shifted(){return this.set.periodic?this.lapPositions(-1):null}track(e,t){let i=this.ensure(e,t),r=this.set.start(e);return i.subarray(3*r,3*(r+this.set.count(e)))}gpuSample(e,t,i,r,s=0){let a=i===this.set.count(e)-1&&t<this.top,o=this.ensure(e,a?t+1:t),l=3*(this.set.start(e)+(a?0:i));r[s]=o[l],r[s+1]=o[l+1],r[s+2]=o[l+2]}bounds(e){if(e===void 0&&this.box!==null)return this.box;let t=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let i=0;i<=(this.invariant?0:this.top);i++){let r=e===void 0?this.lapPositions(i):this.track(e,i);for(let s=0;s<r.length;s+=3)for(let a=0;a<3;a++){let o=r[s+a];o<t[a]&&(t[a]=o),o>t[a+3]&&(t[a+3]=o)}}return e===void 0&&(this.box=t),t}vertex(e,t,i,r=0){let s=this.ensure(e,uh(t)),a=this.set.start(e);if("sample"in t){let c=3*(a+t.sample);i[r]=s[c],i[r+1]=s[c+1],i[r+2]=s[c+2];return}let o=3*(a+t.k),l=t.w;for(let c=0;c<3;c++)i[r+c]=(1-l)*s[o+c]+l*s[o+3+c]}},Ny=n=>n===!0?-1:n===!1?0:n,ch=class{channel;clocks;u;constructor(e,t){this.channel=t,this.clocks=[],this.u=new Float64Array(e.samples);for(let i=0;i<e.tracks;i++){let r=new gi(e,i,t),s=e.start(i);for(let a=0;a<r.m;a++)this.u[s+a]=r.at(a);this.clocks.push(r)}}},ro=class{scene;sets;frames;geometries=new Map;readingsBy=new Map;bodyTrails=new Map;constructor(e,t){this.scene=e,this.sets=new _i(e,t),this.frames=new vi(e)}geometry(e,t){let i=`${e}\0${t}`,r=this.geometries.get(i);return r||(r=new lh(this.sets.get(e),t,this.frames,Ot(this.scene.clock)),this.geometries.set(i,r)),r}hasChannel(e,t){return t===lt||this.sets.get(e).hasChannel(t)}readings(e,t){let i=`${e}\0${t}`,r=this.readingsBy.get(i);return r||(r=new ch(this.sets.get(e),t),this.readingsBy.set(i,r)),r}bodyTrail(e,t,i,r){let s=`${e}\0${t}\0${i}\0${r}`,a=this.bodyTrails.get(s);return a||(a=new hh(this.frames,e,t,this.sets.get(i),r),this.bodyTrails.set(s,a)),a}};function Ud(n,e,t,i,r,s){let a=Ot(r),o=Zt(a*ei(e.reading(r,s)),a),{k:l,w:c}=e.locate(o.u);return(1-c)*n.channelAt(i,t,l,!1,o.lap)+c*n.channelAt(i,t,l+1,!1,o.lap)}var so=n=>n,Od=1<<20,Vs=[Od,0,-Od,0],Oy=n=>[0,-1,n,2];function ao(n,e,t,i){let r=0,s=n.m;for(;r<s;){let a=r+s>>1,o=i(n.at(a));o>e||t&&o===e?s=a:r=a+1}return r}function Uy(n,e,t,i,r=so){if(e===t)return{range:[...Vs],laps:null,pieces:[]};let s=i-1,a=Zt(e,i),o=Zt(t,i),l=Rt(n,a.u,!1,a.lap),c=Rt(n,o.u,!1,o.lap),h=a.lap,u=r(a.u),f=o.lap,d=r(o.u);d===0&&(f--,d=1);let g=[h,u,f,d],y=w=>r(n.at(w)),m=w=>w<s?n.m-2:n.m-1,p=(w,M)=>w<f||w===f&&M<d,b=(w,M)=>w>h||w===h&&u<M,_=ao(n,u,!1,r),v=_<=m(h)?[h,_]:h<s?[h+1,0]:null;v!==null&&!p(v[0],y(v[1]))&&(v=null);let E=Math.min(ao(n,d,!0,r)-1,m(f)),A=E>=0?[f,E]:null;if(A!==null&&!b(A[0],y(A[1]))&&(A=null),v===null||A===null||v[0]>A[0]||v[0]===A[0]&&v[1]>A[1])return{range:g,laps:null,pieces:[[l,c]]};let P=[[l,{sample:v[1],shifted:!1,lap:v[0]}],[{sample:A[1],shifted:!1,lap:A[0]},c]],k=v[0]===A[0]&&v[1]===A[1];return{range:g,laps:k?null:[v[0],A[1]===0?A[0]-1:A[0]],pieces:P}}function Fd(n,e){return(n.reveal??"none")!=="none"||bi(n)||e.mode==="value"&&(n.before==="hidden"||n.after==="hidden")}function Bd(n,e,t=1){return{reveal:n.reveal??"none",fraction:n.trail?.fraction??1,before:n.before,after:n.after,head:bi(n),periodic:e,laps:e?t:1}}function zd(n,e,t,i,r=so){let s=i.laps,a={range:Oy(s-1),laps:[0,s-1],pieces:[]};if(n===null)return{hidden:!1,reading:null,loop:null,head:null,...a};let o=ei(n.reading(e,t),i.before,i.after);if(o===null)return{hidden:!0,reading:null,loop:null,head:null,range:[...Vs],laps:null,pieces:[]};let l=s*o,c=Zt(l,s),h=i.head?Rt(n,c.u,!1,c.lap):null;if(i.reveal==="none")return{hidden:!1,reading:o,loop:l,head:h,...a};let u=i.reveal==="grow"?0:l-s*i.fraction;return u<0&&!i.periodic&&(u=0),{hidden:!1,reading:o,loop:l,head:h,...Uy(n,u,l,s,r)}}function oo(n){return n.samples-n.tracks}function Fy(n,e){return n.start(e)-e}function Vd(n,e){let t=0;for(let i=0;i<n.tracks;i++){let r=n.start(i),s=n.count(i);for(let a=0;a+1<s;a++)e(t++,r+a)}}function Hd(n,e,t){let i=new Float32Array(2*t*oo(n));return Vd(n,(r,s)=>{for(let a=0;a<t;a++)i[2*t*r+a]=e[t*s+a],i[2*t*r+t+a]=e[t*(s+1)+a]}),i}function Gd(n,e,t,i){let r=new Float32Array(2*e*(i-1));for(let s=0;s+1<i;s++)for(let a=0;a<e;a++)r[2*e*s+a]=n[e*(t+s)+a],r[2*e*s+e+a]=n[e*(t+s+1)+a];return r}function Wd(n,e,t,i,r){let s=n.set.count(e),a=n.track(e,t),o=[0,0,0];t<n.top&&n.gpuSample(e,t,s-1,o);for(let l=0;l+1<s;l++,r++)for(let c=0;c<3;c++)i[6*r+c]=a[3*l+c],i[6*r+3+c]=l+2===s&&t<n.top?o[c]:a[3*(l+1)+c]}function $d(n,e){let t=new Float32Array(6*oo(n.set));for(let i=0;i<n.set.tracks;i++)Wd(n,i,e,t,Fy(n.set,i));return t}function Xd(n,e,t){let i=new Float32Array(6*(n.set.count(e)-1));return Wd(n,e,t,i,0),i}function qd(n,e){return("sample"in e?n.at(e.sample):(1-e.w)*n.at(e.k)+e.w*n.at(e.k+1))+uh(e)}function Yd(n,e){let t=new Float32Array(4*oo(n));return Vd(n,(i,r)=>{t[4*i]=t[4*i+2]=e[r],t[4*i+1]=t[4*i+3]=e[r+1]}),t}function jd(n,e,t){let i=new Float32Array(4*(t-1));for(let r=0;r+1<t;r++)i[4*r]=i[4*r+2]=n[e+r],i[4*r+1]=i[4*r+3]=n[e+r+1];return i}function Jd(n){let e=new Float32Array(2*oo(n)),t=0;for(let i=0;i<n.tracks;i++)for(let r=0;r+1<n.count(i);r++,t++)e[2*t]=e[2*t+1]=i;return e}var hh=class{constructor(e,t,i,r,s){this.frames=e;this.body=t;this.display=i;this.set=r;this.track=s;this.m=r.count(s),this.invariant=e.bodyRequirements(t,i).channels.size===0}frames;body;display;set;track;m;invariant;laps=new Map;lap(e){let t=this.invariant?0:e,i=this.laps.get(t);if(i===void 0){i=new Float64Array(3*this.m);let{set:r,track:s}=this;for(let a=0;a<this.m;a++)i.set(this.frames.bodyPosition(this.body,this.display,{set:r,track:s,sample:a,shifted:!1,lap:t}),3*a);this.laps.set(t,i)}return i}vertex(e,t,i=0){let r=this.lap(uh(e));if("sample"in e){let o=3*e.sample;t[i]=r[o],t[i+1]=r[o+1],t[i+2]=r[o+2];return}let s=3*e.k,a=e.w;for(let o=0;o<3;o++)t[i+o]=(1-a)*r[s+o]+a*r[s+3+o]}polyline(e,t,i,r,s){let a=0,o=u=>{this.vertex(u,s,3*a),a++},l=Zt(t,r);if(t===i)return o(Rt(e,l.u,!1,l.lap)),a;let c=Zt(i,r),h=(u,f,d)=>{let g=ao(e,f,!1,so),y=ao(e,d,!0,so);y>g&&(s.set(this.lap(u).subarray(3*g,3*y),3*a),a+=y-g)};if(l.lap===c.lap)return o(Rt(e,l.u,!1,l.lap)),h(l.lap,l.u,c.u),o(Rt(e,c.u,!1,c.lap)),a;o(Rt(e,l.u,!1,l.lap)),h(l.lap,l.u,1);for(let u=l.lap+1;u<c.lap;u++)o(Rt(e,0,!1,u)),h(u,0,1);return o(Rt(e,0,!1,c.lap)),c.u===0||(h(c.lap,0,c.u),o(Rt(e,c.u,!1,c.lap))),a}};function Zd(n,e,t){return(Math.ceil(e*t)+2)*(n+1)+2}var Kd="\u2212";function sn(n,e){if(!Number.isFinite(n))return Number.isNaN(n)?"NaN":n>0?"\u221E":`${Kd}\u221E`;n===0&&(n=0);let t;if(e!==void 0)t=n.toPrecision(e);else if(Number.isInteger(n)&&Math.abs(n)<1e21)t=String(n);else{t=n.toPrecision(6);let[i,r]=t.split("e"),s=i.includes(".")?i.replace(/0+$/,"").replace(/\.$/,""):i;t=r===void 0?s:`${s}e${r}`}return t.replace("e+","e").replace(/-/g,Kd)}function co(n,e,t){let i=it(n.scene,t.variable);if(i?.kind!=="selector"||i.parameter===void 0)return[];let r=[];for(let s of Cs(n,t.domain)){let a=e.get(s);if(!Object.hasOwn(a.def.parameters??{},i.parameter))continue;let o=a.parameter(i.parameter,"2.9");for(let l=0;l<o.length;l++)r.push(o[l])}return r.sort((s,a)=>s-a),r.filter((s,a)=>a===0||s!==r[a-1])}function Hs(n,e){let t=-1;for(let i=0;i<n.length;i++)(t<0||Math.abs(n[i]-e)<Math.abs(n[t]-e))&&(t=i);return t}var ho=8;function Ur(n){return n.seconds??ho*(n.laps??1)}function uo(n,e,t,i,r,s){return n+Math.max(0,e)*i*r/(t*s)}function fo(n,e){return(Math.floor(n)%e+e)%e}function po(n,e){let t=(n%e+e)%e/e;return t<1?t:0}function Qd(n,e){return dh(n,e).join("")}function dh(n,e){let{scene:t,geometry:i,state:r}=n,s=r.panels[n.panel];if(s===void 0||!Object.hasOwn(r.panels,n.panel))return[];let a={scene:t,state:r,panel:s},o=t.views[s.view],l=t.clock.steps,c=(n.frameIndex%l+l)%l,h=n.progress??c/l,u,f=()=>{if(u===void 0){let g=rn(a,o.driver.sets);u=g===null?null:{setId:g,track:Cr(a,o.driver.member,i.sets.get(g))}}return u},d=[];for(let g of e)if(typeof g=="string")d.push(g);else if("clock"in g)d.push(String(g.clock==="index"?c:l));else if("var"in g){let y=xi(a,g.var),m=it(t,g.var);typeof y=="number"?d.push(sn(y,g.digits)):typeof y=="boolean"?d.push(y?"on":"off"):m?.kind==="choice"&&m.labels!==void 0?d.push(m.labels[m.values.indexOf(y)]??y):d.push(y)}else{let y=f();if(y===null){d.push("\u2014");continue}let m=i.sets.get(y.setId);if("member"in g)d.push(sn(m.parameter(g.member,"2.9")[y.track],g.digits));else if("attr"in g)d.push(sn((g.factor??1)*m.attr(g.attr)+(g.offset??0),g.digits));else{let p=i.readings(y.setId,r.clock.channel).clocks[y.track];m.hasChannel(g.channel)||R("2.9",`track set ${y.setId} lacks channel ${JSON.stringify(g.channel)}`),d.push(sn(Ud(m,p,y.track,g.channel,t.clock,h),g.digits))}}return d}function ef(n){let e=[""],t=[];if(n.forEach((a,o)=>{typeof a=="string"?e[e.length-1]+=a:(t.push(o),e.push(""))}),t.length===0)return null;let i=a=>a.every(o=>o.trim()===""),r=[];for(let a=0;a<t.length;a++){let o=e[a].split(","),l=e[a+1].split(",");if((a>0?o.length<2||!i(o.slice(1,-1)):!i(o.slice(0,-1)))||a===t.length-1&&!i(l.slice(1)))return null;let c=o[o.length-1].replace(/\s*[=:]\s*$/,"").trim();if(c==="")return null;let h=n[t[a]],u="clock"in h?5:"channel"in h?(h.digits??6)+5:null;r.push({label:c,part:t[a],unit:l[0].trim(),width:u})}let s=a=>"attr"in n[a.part];return[...r.filter(a=>!s(a)),...r.filter(s)]}var lo=class{times=[];reset(){this.times.length=0}note(e){this.times.push(e);let t=0;for(;t<this.times.length&&this.times[t]<e-1e3;)t++;t>0&&this.times.splice(0,t)}report(e){let t=this.times;if(t.length<2||e-t[0]<900||e-t[t.length-1]>1e3)return null;let i=[];for(let o=1;o<t.length;o++)i.push(t[o]-t[o-1]);let r=[...i].sort((o,l)=>o-l),s=r[Math.floor(r.length/10)],a=i.filter(o=>o>1.5*s).length;return{drawn:t.length,late:a,refresh:s}}};function fh(n){return n===null?"\u2013\u2013 fps":`${n.drawn} fps`}function ph(n){if(n===null)return"Frames drawn per second during playback";let e=Math.round(1e3/n.refresh);return`${n.drawn} frames drawn in the last second, ${n.late} late, on a display refreshing about ${e} times a second`}function tf(n,e,t){let i=e?10:1;switch(n){case" ":case"k":case"K":return{kind:"toggle"};case"ArrowRight":case".":return{kind:"step",by:i};case"ArrowLeft":case",":return{kind:"step",by:-i};case">":return{kind:"step",by:10};case"<":return{kind:"step",by:-10};case"Home":return{kind:"seek",frame:0};case"f":case"F":return{kind:"fit"};case"ArrowUp":return{kind:"slider",by:i};case"ArrowDown":return{kind:"slider",by:-i}}return/^[0-9]$/.test(n)?{kind:"seek",frame:Math.round(t*Number(n)/10)%t}:null}function nf(n,e,t){let i=t.startsWith("Arrow")||t==="Home"||t==="End"||t==="PageUp"||t==="PageDown";return n==="BUTTON"||n==="INPUT"&&e==="checkbox"?t===" "||t==="Enter":n==="INPUT"&&e==="range"?i:n==="SELECT"?i||t==="Enter"||t.length===1:n==="TEXTAREA"||n==="INPUT"}function By(n,e){let t=new Set([e]);for(let i of Object.values(n.track_sets)){let r=i?.parameters;if(r===void 0||!Object.hasOwn(r,e))continue;let s=r[e],a=s.label??e;t.add(s.unit?`${a}, ${s.unit}`:a)}return t}function rf(n,e,t){for(let i of e.layers){if(i.kind!=="track"||i.color===void 0||typeof i.color=="string"||!("parameter"in i.color))continue;let r=i.color.parameter;if(By(n,r).has(t))for(let[s,a]of Object.entries(n.variables??{})){if(a===void 0||a.kind!=="selector"||a.scope==="panel"||a.by==="index"||a.parameter!==r)continue;let o=(n.controls??[]).find(l=>l.kind==="slider"&&l.variable===s);return{variable:s,label:o?.label??s,domain:o?.domain??i.sets}}}return null}function sf(n,e,t,i){return Hs(n,e+Math.min(1,Math.max(0,i))*(t-e))}var Tn={LEFT:0,MIDDLE:1,RIGHT:2,ROTATE:0,DOLLY:1,PAN:2},Fn={ROTATE:0,PAN:1,DOLLY_PAN:2,DOLLY_ROTATE:3},If=0,Gh=1,Lf=2;var Wh=1,Df=2,Yn=3,hi=0,en=1,An=2,Bn=0,lr=1,$h=2,Xh=3,qh=4,kf=5,Ii=100,Nf=101,Of=102,Uf=103,Ff=104,Bf=200,zf=201,Vf=202,Hf=203,Fo=204,Bo=205,Gf=206,Wf=207,$f=208,Xf=209,qf=210,Yf=211,jf=212,Jf=213,Zf=214,hl=0,ul=1,dl=2,cr=3,fl=4,pl=5,ml=6,gl=7,Yh=0,Kf=1,Qf=2,fi=0,ep=1,tp=2,np=3,ip=4,rp=5,sp=6,ap=7;var jh=300,mr=301,gr=302,yl=303,vl=304,ma=306,zo=1e3,Pi=1001,Vo=1002,Vt=1003,op=1004;var ga=1005;var Nn=1006,xl=1007;var Ui=1008;var jn=1009,Jh=1010,Zh=1011,ls=1012,bl=1013,Fi=1014,Cn=1015,cs=1016,_l=1017,Sl=1018,hs=1020,Kh=35902,Qh=35899,eu=1021,tu=1022,on=1023,Zr=1026,us=1027,nu=1028,wl=1029,iu=1030,Ml=1031;var El=1033,ya=33776,va=33777,xa=33778,ba=33779,Tl=35840,Al=35841,Cl=35842,Rl=35843,Pl=36196,Il=37492,Ll=37496,Dl=37808,kl=37809,Nl=37810,Ol=37811,Ul=37812,Fl=37813,Bl=37814,zl=37815,Vl=37816,Hl=37817,Gl=37818,Wl=37819,$l=37820,Xl=37821,ql=36492,Yl=36494,jl=36495,Jl=36283,Zl=36284,Kl=36285,Ql=36286;var Js=2300,Ho=2301,Uo=2302,Uh=2400,Fh=2401,Bh=2402;var lp=3200,cp=3201;var hp=0,up=1,pi="",mn="srgb",ui="srgb-linear",Zs="linear",at="srgb";var or=7680;var zh=519,dp=512,fp=513,pp=514,ru=515,mp=516,gp=517,yp=518,vp=519,Go=35044,mi=35048;var _a="300 es",kn=2e3,Ks=2001;var Xn=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let i=this._listeners;i[e]===void 0&&(i[e]=[]),i[e].indexOf(t)===-1&&i[e].push(t)}hasEventListener(e,t){let i=this._listeners;return i===void 0?!1:i[e]!==void 0&&i[e].indexOf(t)!==-1}removeEventListener(e,t){let i=this._listeners;if(i===void 0)return;let r=i[e];if(r!==void 0){let s=r.indexOf(t);s!==-1&&r.splice(s,1)}}dispatchEvent(e){let t=this._listeners;if(t===void 0)return;let i=t[e.type];if(i!==void 0){e.target=this;let r=i.slice(0);for(let s=0,a=r.length;s<a;s++)r[s].call(this,e);e.target=null}}},qt=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],af=1234567,Ys=Math.PI/180,Kr=180/Math.PI;function li(){let n=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,i=Math.random()*4294967295|0;return(qt[n&255]+qt[n>>8&255]+qt[n>>16&255]+qt[n>>24&255]+"-"+qt[e&255]+qt[e>>8&255]+"-"+qt[e>>16&15|64]+qt[e>>24&255]+"-"+qt[t&63|128]+qt[t>>8&255]+"-"+qt[t>>16&255]+qt[t>>24&255]+qt[i&255]+qt[i>>8&255]+qt[i>>16&255]+qt[i>>24&255]).toLowerCase()}function Xe(n,e,t){return Math.max(e,Math.min(t,n))}function su(n,e){return(n%e+e)%e}function zy(n,e,t,i,r){return i+(n-e)*(r-i)/(t-e)}function Vy(n,e,t){return n!==e?(t-n)/(e-n):0}function js(n,e,t){return(1-t)*n+t*e}function Hy(n,e,t,i){return js(n,e,1-Math.exp(-t*i))}function Gy(n,e=1){return e-Math.abs(su(n,e*2)-e)}function Wy(n,e,t){return n<=e?0:n>=t?1:(n=(n-e)/(t-e),n*n*(3-2*n))}function $y(n,e,t){return n<=e?0:n>=t?1:(n=(n-e)/(t-e),n*n*n*(n*(n*6-15)+10))}function Xy(n,e){return n+Math.floor(Math.random()*(e-n+1))}function qy(n,e){return n+Math.random()*(e-n)}function Yy(n){return n*(.5-Math.random())}function jy(n){n!==void 0&&(af=n);let e=af+=1831565813;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}function Jy(n){return n*Ys}function Zy(n){return n*Kr}function Ky(n){return(n&n-1)===0&&n!==0}function Qy(n){return Math.pow(2,Math.ceil(Math.log(n)/Math.LN2))}function e0(n){return Math.pow(2,Math.floor(Math.log(n)/Math.LN2))}function t0(n,e,t,i,r){let s=Math.cos,a=Math.sin,o=s(t/2),l=a(t/2),c=s((e+i)/2),h=a((e+i)/2),u=s((e-i)/2),f=a((e-i)/2),d=s((i-e)/2),g=a((i-e)/2);switch(r){case"XYX":n.set(o*h,l*u,l*f,o*c);break;case"YZY":n.set(l*f,o*h,l*u,o*c);break;case"ZXZ":n.set(l*u,l*f,o*h,o*c);break;case"XZX":n.set(o*h,l*g,l*d,o*c);break;case"YXY":n.set(l*d,o*h,l*g,o*c);break;case"ZYZ":n.set(l*g,l*d,o*h,o*c);break;default:console.warn("THREE.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+r)}}function Dn(n,e){switch(e.constructor){case Float32Array:return n;case Uint32Array:return n/4294967295;case Uint16Array:return n/65535;case Uint8Array:return n/255;case Int32Array:return Math.max(n/2147483647,-1);case Int16Array:return Math.max(n/32767,-1);case Int8Array:return Math.max(n/127,-1);default:throw new Error("Invalid component type.")}}function st(n,e){switch(e.constructor){case Float32Array:return n;case Uint32Array:return Math.round(n*4294967295);case Uint16Array:return Math.round(n*65535);case Uint8Array:return Math.round(n*255);case Int32Array:return Math.round(n*2147483647);case Int16Array:return Math.round(n*32767);case Int8Array:return Math.round(n*127);default:throw new Error("Invalid component type.")}}var au={DEG2RAD:Ys,RAD2DEG:Kr,generateUUID:li,clamp:Xe,euclideanModulo:su,mapLinear:zy,inverseLerp:Vy,lerp:js,damp:Hy,pingpong:Gy,smoothstep:Wy,smootherstep:$y,randInt:Xy,randFloat:qy,randFloatSpread:Yy,seededRandom:jy,degToRad:Jy,radToDeg:Zy,isPowerOfTwo:Ky,ceilPowerOfTwo:Qy,floorPowerOfTwo:e0,setQuaternionFromProperEuler:t0,normalize:st,denormalize:Dn},Le=class n{constructor(e=0,t=0){n.prototype.isVector2=!0,this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,i=this.y,r=e.elements;return this.x=r[0]*t+r[3]*i+r[6],this.y=r[1]*t+r[4]*i+r[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=Xe(this.x,e.x,t.x),this.y=Xe(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=Xe(this.x,e,t),this.y=Xe(this.y,e,t),this}clampLength(e,t){let i=this.length();return this.divideScalar(i||1).multiplyScalar(Xe(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let i=this.dot(e)/t;return Math.acos(Xe(i,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,i=this.y-e.y;return t*t+i*i}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let i=Math.cos(t),r=Math.sin(t),s=this.x-e.x,a=this.y-e.y;return this.x=s*i-a*r+e.x,this.y=s*r+a*i+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},Mn=class{constructor(e=0,t=0,i=0,r=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=i,this._w=r}static slerpFlat(e,t,i,r,s,a,o){let l=i[r+0],c=i[r+1],h=i[r+2],u=i[r+3],f=s[a+0],d=s[a+1],g=s[a+2],y=s[a+3];if(o===0){e[t+0]=l,e[t+1]=c,e[t+2]=h,e[t+3]=u;return}if(o===1){e[t+0]=f,e[t+1]=d,e[t+2]=g,e[t+3]=y;return}if(u!==y||l!==f||c!==d||h!==g){let m=1-o,p=l*f+c*d+h*g+u*y,b=p>=0?1:-1,_=1-p*p;if(_>Number.EPSILON){let E=Math.sqrt(_),A=Math.atan2(E,p*b);m=Math.sin(m*A)/E,o=Math.sin(o*A)/E}let v=o*b;if(l=l*m+f*v,c=c*m+d*v,h=h*m+g*v,u=u*m+y*v,m===1-o){let E=1/Math.sqrt(l*l+c*c+h*h+u*u);l*=E,c*=E,h*=E,u*=E}}e[t]=l,e[t+1]=c,e[t+2]=h,e[t+3]=u}static multiplyQuaternionsFlat(e,t,i,r,s,a){let o=i[r],l=i[r+1],c=i[r+2],h=i[r+3],u=s[a],f=s[a+1],d=s[a+2],g=s[a+3];return e[t]=o*g+h*u+l*d-c*f,e[t+1]=l*g+h*f+c*u-o*d,e[t+2]=c*g+h*d+o*f-l*u,e[t+3]=h*g-o*u-l*f-c*d,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,i,r){return this._x=e,this._y=t,this._z=i,this._w=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let i=e._x,r=e._y,s=e._z,a=e._order,o=Math.cos,l=Math.sin,c=o(i/2),h=o(r/2),u=o(s/2),f=l(i/2),d=l(r/2),g=l(s/2);switch(a){case"XYZ":this._x=f*h*u+c*d*g,this._y=c*d*u-f*h*g,this._z=c*h*g+f*d*u,this._w=c*h*u-f*d*g;break;case"YXZ":this._x=f*h*u+c*d*g,this._y=c*d*u-f*h*g,this._z=c*h*g-f*d*u,this._w=c*h*u+f*d*g;break;case"ZXY":this._x=f*h*u-c*d*g,this._y=c*d*u+f*h*g,this._z=c*h*g+f*d*u,this._w=c*h*u-f*d*g;break;case"ZYX":this._x=f*h*u-c*d*g,this._y=c*d*u+f*h*g,this._z=c*h*g-f*d*u,this._w=c*h*u+f*d*g;break;case"YZX":this._x=f*h*u+c*d*g,this._y=c*d*u+f*h*g,this._z=c*h*g-f*d*u,this._w=c*h*u-f*d*g;break;case"XZY":this._x=f*h*u-c*d*g,this._y=c*d*u-f*h*g,this._z=c*h*g+f*d*u,this._w=c*h*u+f*d*g;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let i=t/2,r=Math.sin(i);return this._x=e.x*r,this._y=e.y*r,this._z=e.z*r,this._w=Math.cos(i),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,i=t[0],r=t[4],s=t[8],a=t[1],o=t[5],l=t[9],c=t[2],h=t[6],u=t[10],f=i+o+u;if(f>0){let d=.5/Math.sqrt(f+1);this._w=.25/d,this._x=(h-l)*d,this._y=(s-c)*d,this._z=(a-r)*d}else if(i>o&&i>u){let d=2*Math.sqrt(1+i-o-u);this._w=(h-l)/d,this._x=.25*d,this._y=(r+a)/d,this._z=(s+c)/d}else if(o>u){let d=2*Math.sqrt(1+o-i-u);this._w=(s-c)/d,this._x=(r+a)/d,this._y=.25*d,this._z=(l+h)/d}else{let d=2*Math.sqrt(1+u-i-o);this._w=(a-r)/d,this._x=(s+c)/d,this._y=(l+h)/d,this._z=.25*d}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let i=e.dot(t)+1;return i<1e-8?(i=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=i):(this._x=0,this._y=-e.z,this._z=e.y,this._w=i)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=i),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(Xe(this.dot(e),-1,1)))}rotateTowards(e,t){let i=this.angleTo(e);if(i===0)return this;let r=Math.min(1,t/i);return this.slerp(e,r),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let i=e._x,r=e._y,s=e._z,a=e._w,o=t._x,l=t._y,c=t._z,h=t._w;return this._x=i*h+a*o+r*c-s*l,this._y=r*h+a*l+s*o-i*c,this._z=s*h+a*c+i*l-r*o,this._w=a*h-i*o-r*l-s*c,this._onChangeCallback(),this}slerp(e,t){if(t===0)return this;if(t===1)return this.copy(e);let i=this._x,r=this._y,s=this._z,a=this._w,o=a*e._w+i*e._x+r*e._y+s*e._z;if(o<0?(this._w=-e._w,this._x=-e._x,this._y=-e._y,this._z=-e._z,o=-o):this.copy(e),o>=1)return this._w=a,this._x=i,this._y=r,this._z=s,this;let l=1-o*o;if(l<=Number.EPSILON){let d=1-t;return this._w=d*a+t*this._w,this._x=d*i+t*this._x,this._y=d*r+t*this._y,this._z=d*s+t*this._z,this.normalize(),this}let c=Math.sqrt(l),h=Math.atan2(c,o),u=Math.sin((1-t)*h)/c,f=Math.sin(t*h)/c;return this._w=a*u+this._w*f,this._x=i*u+this._x*f,this._y=r*u+this._y*f,this._z=s*u+this._z*f,this._onChangeCallback(),this}slerpQuaternions(e,t,i){return this.copy(e).slerp(t,i)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),i=Math.random(),r=Math.sqrt(1-i),s=Math.sqrt(i);return this.set(r*Math.sin(e),r*Math.cos(e),s*Math.sin(t),s*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},N=class n{constructor(e=0,t=0,i=0){n.prototype.isVector3=!0,this.x=e,this.y=t,this.z=i}set(e,t,i){return i===void 0&&(i=this.z),this.x=e,this.y=t,this.z=i,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(of.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(of.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,i=this.y,r=this.z,s=e.elements;return this.x=s[0]*t+s[3]*i+s[6]*r,this.y=s[1]*t+s[4]*i+s[7]*r,this.z=s[2]*t+s[5]*i+s[8]*r,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,i=this.y,r=this.z,s=e.elements,a=1/(s[3]*t+s[7]*i+s[11]*r+s[15]);return this.x=(s[0]*t+s[4]*i+s[8]*r+s[12])*a,this.y=(s[1]*t+s[5]*i+s[9]*r+s[13])*a,this.z=(s[2]*t+s[6]*i+s[10]*r+s[14])*a,this}applyQuaternion(e){let t=this.x,i=this.y,r=this.z,s=e.x,a=e.y,o=e.z,l=e.w,c=2*(a*r-o*i),h=2*(o*t-s*r),u=2*(s*i-a*t);return this.x=t+l*c+a*u-o*h,this.y=i+l*h+o*c-s*u,this.z=r+l*u+s*h-a*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,i=this.y,r=this.z,s=e.elements;return this.x=s[0]*t+s[4]*i+s[8]*r,this.y=s[1]*t+s[5]*i+s[9]*r,this.z=s[2]*t+s[6]*i+s[10]*r,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=Xe(this.x,e.x,t.x),this.y=Xe(this.y,e.y,t.y),this.z=Xe(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=Xe(this.x,e,t),this.y=Xe(this.y,e,t),this.z=Xe(this.z,e,t),this}clampLength(e,t){let i=this.length();return this.divideScalar(i||1).multiplyScalar(Xe(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this.z=e.z+(t.z-e.z)*i,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let i=e.x,r=e.y,s=e.z,a=t.x,o=t.y,l=t.z;return this.x=r*l-s*o,this.y=s*a-i*l,this.z=i*o-r*a,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let i=e.dot(this)/t;return this.copy(e).multiplyScalar(i)}projectOnPlane(e){return mh.copy(this).projectOnVector(e),this.sub(mh)}reflect(e){return this.sub(mh.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let i=this.dot(e)/t;return Math.acos(Xe(i,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,i=this.y-e.y,r=this.z-e.z;return t*t+i*i+r*r}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,i){let r=Math.sin(t)*e;return this.x=r*Math.sin(i),this.y=Math.cos(t)*e,this.z=r*Math.cos(i),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,i){return this.x=e*Math.sin(t),this.y=i,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),i=this.setFromMatrixColumn(e,1).length(),r=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=i,this.z=r,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=Math.random()*2-1,i=Math.sqrt(1-t*t);return this.x=i*Math.cos(e),this.y=t,this.z=i*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},mh=new N,of=new Mn,ze=class n{constructor(e,t,i,r,s,a,o,l,c){n.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,i,r,s,a,o,l,c)}set(e,t,i,r,s,a,o,l,c){let h=this.elements;return h[0]=e,h[1]=r,h[2]=o,h[3]=t,h[4]=s,h[5]=l,h[6]=i,h[7]=a,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,i=e.elements;return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=i[3],t[4]=i[4],t[5]=i[5],t[6]=i[6],t[7]=i[7],t[8]=i[8],this}extractBasis(e,t,i){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),i.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let i=e.elements,r=t.elements,s=this.elements,a=i[0],o=i[3],l=i[6],c=i[1],h=i[4],u=i[7],f=i[2],d=i[5],g=i[8],y=r[0],m=r[3],p=r[6],b=r[1],_=r[4],v=r[7],E=r[2],A=r[5],P=r[8];return s[0]=a*y+o*b+l*E,s[3]=a*m+o*_+l*A,s[6]=a*p+o*v+l*P,s[1]=c*y+h*b+u*E,s[4]=c*m+h*_+u*A,s[7]=c*p+h*v+u*P,s[2]=f*y+d*b+g*E,s[5]=f*m+d*_+g*A,s[8]=f*p+d*v+g*P,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],i=e[1],r=e[2],s=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8];return t*a*h-t*o*c-i*s*h+i*o*l+r*s*c-r*a*l}invert(){let e=this.elements,t=e[0],i=e[1],r=e[2],s=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8],u=h*a-o*c,f=o*l-h*s,d=c*s-a*l,g=t*u+i*f+r*d;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);let y=1/g;return e[0]=u*y,e[1]=(r*c-h*i)*y,e[2]=(o*i-r*a)*y,e[3]=f*y,e[4]=(h*t-r*l)*y,e[5]=(r*s-o*t)*y,e[6]=d*y,e[7]=(i*l-c*t)*y,e[8]=(a*t-i*s)*y,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,i,r,s,a,o){let l=Math.cos(s),c=Math.sin(s);return this.set(i*l,i*c,-i*(l*a+c*o)+a+e,-r*c,r*l,-r*(-c*a+l*o)+o+t,0,0,1),this}scale(e,t){return this.premultiply(gh.makeScale(e,t)),this}rotate(e){return this.premultiply(gh.makeRotation(-e)),this}translate(e,t){return this.premultiply(gh.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),i=Math.sin(e);return this.set(t,-i,0,i,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,i=e.elements;for(let r=0;r<9;r++)if(t[r]!==i[r])return!1;return!0}fromArray(e,t=0){for(let i=0;i<9;i++)this.elements[i]=e[i+t];return this}toArray(e=[],t=0){let i=this.elements;return e[t]=i[0],e[t+1]=i[1],e[t+2]=i[2],e[t+3]=i[3],e[t+4]=i[4],e[t+5]=i[5],e[t+6]=i[6],e[t+7]=i[7],e[t+8]=i[8],e}clone(){return new this.constructor().fromArray(this.elements)}},gh=new ze;function ou(n){for(let e=n.length-1;e>=0;--e)if(n[e]>=65535)return!0;return!1}function Qs(n){return document.createElementNS("http://www.w3.org/1999/xhtml",n)}function xp(){let n=Qs("canvas");return n.style.display="block",n}var lf={};function Qr(n){n in lf||(lf[n]=!0,console.warn(n))}function bp(n,e,t){return new Promise(function(i,r){function s(){switch(n.clientWaitSync(e,n.SYNC_FLUSH_COMMANDS_BIT,0)){case n.WAIT_FAILED:r();break;case n.TIMEOUT_EXPIRED:setTimeout(s,t);break;default:i()}}setTimeout(s,t)})}var cf=new ze().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),hf=new ze().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function n0(){let n={enabled:!0,workingColorSpace:ui,spaces:{},convert:function(r,s,a){return this.enabled===!1||s===a||!s||!a||(this.spaces[s].transfer===at&&(r.r=ci(r.r),r.g=ci(r.g),r.b=ci(r.b)),this.spaces[s].primaries!==this.spaces[a].primaries&&(r.applyMatrix3(this.spaces[s].toXYZ),r.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===at&&(r.r=Jr(r.r),r.g=Jr(r.g),r.b=Jr(r.b))),r},workingToColorSpace:function(r,s){return this.convert(r,this.workingColorSpace,s)},colorSpaceToWorking:function(r,s){return this.convert(r,s,this.workingColorSpace)},getPrimaries:function(r){return this.spaces[r].primaries},getTransfer:function(r){return r===pi?Zs:this.spaces[r].transfer},getToneMappingMode:function(r){return this.spaces[r].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(r,s=this.workingColorSpace){return r.fromArray(this.spaces[s].luminanceCoefficients)},define:function(r){Object.assign(this.spaces,r)},_getMatrix:function(r,s,a){return r.copy(this.spaces[s].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(r){return this.spaces[r].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(r=this.workingColorSpace){return this.spaces[r].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(r,s){return Qr("THREE.ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),n.workingToColorSpace(r,s)},toWorkingColorSpace:function(r,s){return Qr("THREE.ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),n.colorSpaceToWorking(r,s)}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],i=[.3127,.329];return n.define({[ui]:{primaries:e,whitePoint:i,transfer:Zs,toXYZ:cf,fromXYZ:hf,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:mn},outputColorSpaceConfig:{drawingBufferColorSpace:mn}},[mn]:{primaries:e,whitePoint:i,transfer:at,toXYZ:cf,fromXYZ:hf,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:mn}}}),n}var Ke=n0();function ci(n){return n<.04045?n*.0773993808:Math.pow(n*.9478672986+.0521327014,2.4)}function Jr(n){return n<.0031308?n*12.92:1.055*Math.pow(n,.41666)-.055}var Fr,Wo=class{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let i;if(e instanceof HTMLCanvasElement)i=e;else{Fr===void 0&&(Fr=Qs("canvas")),Fr.width=e.width,Fr.height=e.height;let r=Fr.getContext("2d");e instanceof ImageData?r.putImageData(e,0,0):r.drawImage(e,0,0,e.width,e.height),i=Fr}return i.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){let t=Qs("canvas");t.width=e.width,t.height=e.height;let i=t.getContext("2d");i.drawImage(e,0,0,e.width,e.height);let r=i.getImageData(0,0,e.width,e.height),s=r.data;for(let a=0;a<s.length;a++)s[a]=ci(s[a]/255)*255;return i.putImageData(r,0,0),t}else if(e.data){let t=e.data.slice(0);for(let i=0;i<t.length;i++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[i]=Math.floor(ci(t[i]/255)*255):t[i]=ci(t[i]);return{data:t,width:e.width,height:e.height}}else return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}},i0=0,es=class{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:i0++}),this.uuid=li(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){let t=this.data;return typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):t instanceof VideoFrame?e.set(t.displayHeight,t.displayWidth,0):t!==null?e.set(t.width,t.height,t.depth||0):e.set(0,0,0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let i={uuid:this.uuid,url:""},r=this.data;if(r!==null){let s;if(Array.isArray(r)){s=[];for(let a=0,o=r.length;a<o;a++)r[a].isDataTexture?s.push(yh(r[a].image)):s.push(yh(r[a]))}else s=yh(r);i.url=s}return t||(e.images[this.uuid]=i),i}};function yh(n){return typeof HTMLImageElement<"u"&&n instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&n instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&n instanceof ImageBitmap?Wo.getDataURL(n):n.data?{data:Array.from(n.data),width:n.width,height:n.height,type:n.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}var r0=0,vh=new N,Qt=class n extends Xn{constructor(e=n.DEFAULT_IMAGE,t=n.DEFAULT_MAPPING,i=Pi,r=Pi,s=Nn,a=Ui,o=on,l=jn,c=n.DEFAULT_ANISOTROPY,h=pi){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:r0++}),this.uuid=li(),this.name="",this.source=new es(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=i,this.wrapT=r,this.magFilter=s,this.minFilter=a,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new Le(0,0),this.repeat=new Le(1,1),this.center=new Le(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new ze,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0}get width(){return this.source.getSize(vh).x}get height(){return this.source.getSize(vh).y}get depth(){return this.source.getSize(vh).z}get image(){return this.source.data}set image(e=null){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(let t in e){let i=e[t];if(i===void 0){console.warn(`THREE.Texture.setValues(): parameter '${t}' has value of undefined.`);continue}let r=this[t];if(r===void 0){console.warn(`THREE.Texture.setValues(): property '${t}' does not exist.`);continue}r&&i&&r.isVector2&&i.isVector2||r&&i&&r.isVector3&&i.isVector3||r&&i&&r.isMatrix3&&i.isMatrix3?r.copy(i):this[t]=i}}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let i={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(i.userData=this.userData),t||(e.textures[this.uuid]=i),i}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==jh)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case zo:e.x=e.x-Math.floor(e.x);break;case Pi:e.x=e.x<0?0:1;break;case Vo:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case zo:e.y=e.y-Math.floor(e.y);break;case Pi:e.y=e.y<0?0:1;break;case Vo:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}};Qt.DEFAULT_IMAGE=null;Qt.DEFAULT_MAPPING=jh;Qt.DEFAULT_ANISOTROPY=1;var ut=class n{constructor(e=0,t=0,i=0,r=1){n.prototype.isVector4=!0,this.x=e,this.y=t,this.z=i,this.w=r}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,i,r){return this.x=e,this.y=t,this.z=i,this.w=r,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,i=this.y,r=this.z,s=this.w,a=e.elements;return this.x=a[0]*t+a[4]*i+a[8]*r+a[12]*s,this.y=a[1]*t+a[5]*i+a[9]*r+a[13]*s,this.z=a[2]*t+a[6]*i+a[10]*r+a[14]*s,this.w=a[3]*t+a[7]*i+a[11]*r+a[15]*s,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,i,r,s,l=e.elements,c=l[0],h=l[4],u=l[8],f=l[1],d=l[5],g=l[9],y=l[2],m=l[6],p=l[10];if(Math.abs(h-f)<.01&&Math.abs(u-y)<.01&&Math.abs(g-m)<.01){if(Math.abs(h+f)<.1&&Math.abs(u+y)<.1&&Math.abs(g+m)<.1&&Math.abs(c+d+p-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;let _=(c+1)/2,v=(d+1)/2,E=(p+1)/2,A=(h+f)/4,P=(u+y)/4,k=(g+m)/4;return _>v&&_>E?_<.01?(i=0,r=.707106781,s=.707106781):(i=Math.sqrt(_),r=A/i,s=P/i):v>E?v<.01?(i=.707106781,r=0,s=.707106781):(r=Math.sqrt(v),i=A/r,s=k/r):E<.01?(i=.707106781,r=.707106781,s=0):(s=Math.sqrt(E),i=P/s,r=k/s),this.set(i,r,s,t),this}let b=Math.sqrt((m-g)*(m-g)+(u-y)*(u-y)+(f-h)*(f-h));return Math.abs(b)<.001&&(b=1),this.x=(m-g)/b,this.y=(u-y)/b,this.z=(f-h)/b,this.w=Math.acos((c+d+p-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=Xe(this.x,e.x,t.x),this.y=Xe(this.y,e.y,t.y),this.z=Xe(this.z,e.z,t.z),this.w=Xe(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=Xe(this.x,e,t),this.y=Xe(this.y,e,t),this.z=Xe(this.z,e,t),this.w=Xe(this.w,e,t),this}clampLength(e,t){let i=this.length();return this.divideScalar(i||1).multiplyScalar(Xe(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this.z=e.z+(t.z-e.z)*i,this.w=e.w+(t.w-e.w)*i,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},$o=class extends Xn{constructor(e=1,t=1,i={}){super(),i=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Nn,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1},i),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=i.depth,this.scissor=new ut(0,0,e,t),this.scissorTest=!1,this.viewport=new ut(0,0,e,t);let r={width:e,height:t,depth:i.depth},s=new Qt(r);this.textures=[];let a=i.count;for(let o=0;o<a;o++)this.textures[o]=s.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(i),this.depthBuffer=i.depthBuffer,this.stencilBuffer=i.stencilBuffer,this.resolveDepthBuffer=i.resolveDepthBuffer,this.resolveStencilBuffer=i.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=i.depthTexture,this.samples=i.samples,this.multiview=i.multiview}_setTextureOptions(e={}){let t={minFilter:Nn,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let i=0;i<this.textures.length;i++)this.textures[i].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),e!==null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,i=1){if(this.width!==e||this.height!==t||this.depth!==i){this.width=e,this.height=t,this.depth=i;for(let r=0,s=this.textures.length;r<s;r++)this.textures[r].image.width=e,this.textures[r].image.height=t,this.textures[r].image.depth=i,this.textures[r].isArrayTexture=this.textures[r].image.depth>1;this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,i=e.textures.length;t<i;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;let r=Object.assign({},e.textures[t].image);this.textures[t].source=new es(r)}return this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}},En=class extends $o{constructor(e=1,t=1,i={}){super(e,t,i),this.isWebGLRenderTarget=!0}},ea=class extends Qt{constructor(e=null,t=1,i=1,r=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:i,depth:r},this.magFilter=Vt,this.minFilter=Vt,this.wrapR=Pi,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}};var Xo=class extends Qt{constructor(e=null,t=1,i=1,r=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:i,depth:r},this.magFilter=Vt,this.minFilter=Vt,this.wrapR=Pi,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var On=class{constructor(e=new N(1/0,1/0,1/0),t=new N(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t+=3)this.expandByPoint(Pn.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,i=e.count;t<i;t++)this.expandByPoint(Pn.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let i=Pn.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(i),this.max.copy(e).add(i),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let i=e.geometry;if(i!==void 0){let s=i.getAttribute("position");if(t===!0&&s!==void 0&&e.isInstancedMesh!==!0)for(let a=0,o=s.count;a<o;a++)e.isMesh===!0?e.getVertexPosition(a,Pn):Pn.fromBufferAttribute(s,a),Pn.applyMatrix4(e.matrixWorld),this.expandByPoint(Pn);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),mo.copy(e.boundingBox)):(i.boundingBox===null&&i.computeBoundingBox(),mo.copy(i.boundingBox)),mo.applyMatrix4(e.matrixWorld),this.union(mo)}let r=e.children;for(let s=0,a=r.length;s<a;s++)this.expandByObject(r[s],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,Pn),Pn.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,i;return e.normal.x>0?(t=e.normal.x*this.min.x,i=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,i=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,i+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,i+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,i+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,i+=e.normal.z*this.min.z),t<=-e.constant&&i>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(Gs),go.subVectors(this.max,Gs),Br.subVectors(e.a,Gs),zr.subVectors(e.b,Gs),Vr.subVectors(e.c,Gs),wi.subVectors(zr,Br),Mi.subVectors(Vr,zr),ir.subVectors(Br,Vr);let t=[0,-wi.z,wi.y,0,-Mi.z,Mi.y,0,-ir.z,ir.y,wi.z,0,-wi.x,Mi.z,0,-Mi.x,ir.z,0,-ir.x,-wi.y,wi.x,0,-Mi.y,Mi.x,0,-ir.y,ir.x,0];return!xh(t,Br,zr,Vr,go)||(t=[1,0,0,0,1,0,0,0,1],!xh(t,Br,zr,Vr,go))?!1:(yo.crossVectors(wi,Mi),t=[yo.x,yo.y,yo.z],xh(t,Br,zr,Vr,go))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Pn).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(Pn).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(ii[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),ii[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),ii[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),ii[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),ii[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),ii[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),ii[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),ii[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(ii),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}},ii=[new N,new N,new N,new N,new N,new N,new N,new N],Pn=new N,mo=new On,Br=new N,zr=new N,Vr=new N,wi=new N,Mi=new N,ir=new N,Gs=new N,go=new N,yo=new N,rr=new N;function xh(n,e,t,i,r){for(let s=0,a=n.length-3;s<=a;s+=3){rr.fromArray(n,s);let o=r.x*Math.abs(rr.x)+r.y*Math.abs(rr.y)+r.z*Math.abs(rr.z),l=e.dot(rr),c=t.dot(rr),h=i.dot(rr);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>o)return!1}return!0}var s0=new On,Ws=new N,bh=new N,Li=class{constructor(e=new N,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let i=this.center;t!==void 0?i.copy(t):s0.setFromPoints(e).getCenter(i);let r=0;for(let s=0,a=e.length;s<a;s++)r=Math.max(r,i.distanceToSquared(e[s]));return this.radius=Math.sqrt(r),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let i=this.center.distanceToSquared(e);return t.copy(e),i>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;Ws.subVectors(e,this.center);let t=Ws.lengthSq();if(t>this.radius*this.radius){let i=Math.sqrt(t),r=(i-this.radius)*.5;this.center.addScaledVector(Ws,r/i),this.radius+=r}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(bh.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(Ws.copy(e.center).add(bh)),this.expandByPoint(Ws.copy(e.center).sub(bh))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}},ri=new N,_h=new N,vo=new N,Ei=new N,Sh=new N,xo=new N,wh=new N,Di=class{constructor(e=new N,t=new N(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,ri)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let i=t.dot(this.direction);return i<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,i)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=ri.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(ri.copy(this.origin).addScaledVector(this.direction,t),ri.distanceToSquared(e))}distanceSqToSegment(e,t,i,r){_h.copy(e).add(t).multiplyScalar(.5),vo.copy(t).sub(e).normalize(),Ei.copy(this.origin).sub(_h);let s=e.distanceTo(t)*.5,a=-this.direction.dot(vo),o=Ei.dot(this.direction),l=-Ei.dot(vo),c=Ei.lengthSq(),h=Math.abs(1-a*a),u,f,d,g;if(h>0)if(u=a*l-o,f=a*o-l,g=s*h,u>=0)if(f>=-g)if(f<=g){let y=1/h;u*=y,f*=y,d=u*(u+a*f+2*o)+f*(a*u+f+2*l)+c}else f=s,u=Math.max(0,-(a*f+o)),d=-u*u+f*(f+2*l)+c;else f=-s,u=Math.max(0,-(a*f+o)),d=-u*u+f*(f+2*l)+c;else f<=-g?(u=Math.max(0,-(-a*s+o)),f=u>0?-s:Math.min(Math.max(-s,-l),s),d=-u*u+f*(f+2*l)+c):f<=g?(u=0,f=Math.min(Math.max(-s,-l),s),d=f*(f+2*l)+c):(u=Math.max(0,-(a*s+o)),f=u>0?s:Math.min(Math.max(-s,-l),s),d=-u*u+f*(f+2*l)+c);else f=a>0?-s:s,u=Math.max(0,-(a*f+o)),d=-u*u+f*(f+2*l)+c;return i&&i.copy(this.origin).addScaledVector(this.direction,u),r&&r.copy(_h).addScaledVector(vo,f),d}intersectSphere(e,t){ri.subVectors(e.center,this.origin);let i=ri.dot(this.direction),r=ri.dot(ri)-i*i,s=e.radius*e.radius;if(r>s)return null;let a=Math.sqrt(s-r),o=i-a,l=i+a;return l<0?null:o<0?this.at(l,t):this.at(o,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let i=-(this.origin.dot(e.normal)+e.constant)/t;return i>=0?i:null}intersectPlane(e,t){let i=this.distanceToPlane(e);return i===null?null:this.at(i,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let i,r,s,a,o,l,c=1/this.direction.x,h=1/this.direction.y,u=1/this.direction.z,f=this.origin;return c>=0?(i=(e.min.x-f.x)*c,r=(e.max.x-f.x)*c):(i=(e.max.x-f.x)*c,r=(e.min.x-f.x)*c),h>=0?(s=(e.min.y-f.y)*h,a=(e.max.y-f.y)*h):(s=(e.max.y-f.y)*h,a=(e.min.y-f.y)*h),i>a||s>r||((s>i||isNaN(i))&&(i=s),(a<r||isNaN(r))&&(r=a),u>=0?(o=(e.min.z-f.z)*u,l=(e.max.z-f.z)*u):(o=(e.max.z-f.z)*u,l=(e.min.z-f.z)*u),i>l||o>r)||((o>i||i!==i)&&(i=o),(l<r||r!==r)&&(r=l),r<0)?null:this.at(i>=0?i:r,t)}intersectsBox(e){return this.intersectBox(e,ri)!==null}intersectTriangle(e,t,i,r,s){Sh.subVectors(t,e),xo.subVectors(i,e),wh.crossVectors(Sh,xo);let a=this.direction.dot(wh),o;if(a>0){if(r)return null;o=1}else if(a<0)o=-1,a=-a;else return null;Ei.subVectors(this.origin,e);let l=o*this.direction.dot(xo.crossVectors(Ei,xo));if(l<0)return null;let c=o*this.direction.dot(Sh.cross(Ei));if(c<0||l+c>a)return null;let h=-o*Ei.dot(wh);return h<0?null:this.at(h/a,s)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},bt=class n{constructor(e,t,i,r,s,a,o,l,c,h,u,f,d,g,y,m){n.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,i,r,s,a,o,l,c,h,u,f,d,g,y,m)}set(e,t,i,r,s,a,o,l,c,h,u,f,d,g,y,m){let p=this.elements;return p[0]=e,p[4]=t,p[8]=i,p[12]=r,p[1]=s,p[5]=a,p[9]=o,p[13]=l,p[2]=c,p[6]=h,p[10]=u,p[14]=f,p[3]=d,p[7]=g,p[11]=y,p[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new n().fromArray(this.elements)}copy(e){let t=this.elements,i=e.elements;return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=i[3],t[4]=i[4],t[5]=i[5],t[6]=i[6],t[7]=i[7],t[8]=i[8],t[9]=i[9],t[10]=i[10],t[11]=i[11],t[12]=i[12],t[13]=i[13],t[14]=i[14],t[15]=i[15],this}copyPosition(e){let t=this.elements,i=e.elements;return t[12]=i[12],t[13]=i[13],t[14]=i[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,i){return e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),i.setFromMatrixColumn(this,2),this}makeBasis(e,t,i){return this.set(e.x,t.x,i.x,0,e.y,t.y,i.y,0,e.z,t.z,i.z,0,0,0,0,1),this}extractRotation(e){let t=this.elements,i=e.elements,r=1/Hr.setFromMatrixColumn(e,0).length(),s=1/Hr.setFromMatrixColumn(e,1).length(),a=1/Hr.setFromMatrixColumn(e,2).length();return t[0]=i[0]*r,t[1]=i[1]*r,t[2]=i[2]*r,t[3]=0,t[4]=i[4]*s,t[5]=i[5]*s,t[6]=i[6]*s,t[7]=0,t[8]=i[8]*a,t[9]=i[9]*a,t[10]=i[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,i=e.x,r=e.y,s=e.z,a=Math.cos(i),o=Math.sin(i),l=Math.cos(r),c=Math.sin(r),h=Math.cos(s),u=Math.sin(s);if(e.order==="XYZ"){let f=a*h,d=a*u,g=o*h,y=o*u;t[0]=l*h,t[4]=-l*u,t[8]=c,t[1]=d+g*c,t[5]=f-y*c,t[9]=-o*l,t[2]=y-f*c,t[6]=g+d*c,t[10]=a*l}else if(e.order==="YXZ"){let f=l*h,d=l*u,g=c*h,y=c*u;t[0]=f+y*o,t[4]=g*o-d,t[8]=a*c,t[1]=a*u,t[5]=a*h,t[9]=-o,t[2]=d*o-g,t[6]=y+f*o,t[10]=a*l}else if(e.order==="ZXY"){let f=l*h,d=l*u,g=c*h,y=c*u;t[0]=f-y*o,t[4]=-a*u,t[8]=g+d*o,t[1]=d+g*o,t[5]=a*h,t[9]=y-f*o,t[2]=-a*c,t[6]=o,t[10]=a*l}else if(e.order==="ZYX"){let f=a*h,d=a*u,g=o*h,y=o*u;t[0]=l*h,t[4]=g*c-d,t[8]=f*c+y,t[1]=l*u,t[5]=y*c+f,t[9]=d*c-g,t[2]=-c,t[6]=o*l,t[10]=a*l}else if(e.order==="YZX"){let f=a*l,d=a*c,g=o*l,y=o*c;t[0]=l*h,t[4]=y-f*u,t[8]=g*u+d,t[1]=u,t[5]=a*h,t[9]=-o*h,t[2]=-c*h,t[6]=d*u+g,t[10]=f-y*u}else if(e.order==="XZY"){let f=a*l,d=a*c,g=o*l,y=o*c;t[0]=l*h,t[4]=-u,t[8]=c*h,t[1]=f*u+y,t[5]=a*h,t[9]=d*u-g,t[2]=g*u-d,t[6]=o*h,t[10]=y*u+f}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(a0,e,o0)}lookAt(e,t,i){let r=this.elements;return fn.subVectors(e,t),fn.lengthSq()===0&&(fn.z=1),fn.normalize(),Ti.crossVectors(i,fn),Ti.lengthSq()===0&&(Math.abs(i.z)===1?fn.x+=1e-4:fn.z+=1e-4,fn.normalize(),Ti.crossVectors(i,fn)),Ti.normalize(),bo.crossVectors(fn,Ti),r[0]=Ti.x,r[4]=bo.x,r[8]=fn.x,r[1]=Ti.y,r[5]=bo.y,r[9]=fn.y,r[2]=Ti.z,r[6]=bo.z,r[10]=fn.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let i=e.elements,r=t.elements,s=this.elements,a=i[0],o=i[4],l=i[8],c=i[12],h=i[1],u=i[5],f=i[9],d=i[13],g=i[2],y=i[6],m=i[10],p=i[14],b=i[3],_=i[7],v=i[11],E=i[15],A=r[0],P=r[4],k=r[8],w=r[12],M=r[1],L=r[5],V=r[9],W=r[13],Y=r[2],j=r[6],X=r[10],re=r[14],H=r[3],oe=r[7],ee=r[11],Me=r[15];return s[0]=a*A+o*M+l*Y+c*H,s[4]=a*P+o*L+l*j+c*oe,s[8]=a*k+o*V+l*X+c*ee,s[12]=a*w+o*W+l*re+c*Me,s[1]=h*A+u*M+f*Y+d*H,s[5]=h*P+u*L+f*j+d*oe,s[9]=h*k+u*V+f*X+d*ee,s[13]=h*w+u*W+f*re+d*Me,s[2]=g*A+y*M+m*Y+p*H,s[6]=g*P+y*L+m*j+p*oe,s[10]=g*k+y*V+m*X+p*ee,s[14]=g*w+y*W+m*re+p*Me,s[3]=b*A+_*M+v*Y+E*H,s[7]=b*P+_*L+v*j+E*oe,s[11]=b*k+_*V+v*X+E*ee,s[15]=b*w+_*W+v*re+E*Me,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],i=e[4],r=e[8],s=e[12],a=e[1],o=e[5],l=e[9],c=e[13],h=e[2],u=e[6],f=e[10],d=e[14],g=e[3],y=e[7],m=e[11],p=e[15];return g*(+s*l*u-r*c*u-s*o*f+i*c*f+r*o*d-i*l*d)+y*(+t*l*d-t*c*f+s*a*f-r*a*d+r*c*h-s*l*h)+m*(+t*c*u-t*o*d-s*a*u+i*a*d+s*o*h-i*c*h)+p*(-r*o*h-t*l*u+t*o*f+r*a*u-i*a*f+i*l*h)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,i){let r=this.elements;return e.isVector3?(r[12]=e.x,r[13]=e.y,r[14]=e.z):(r[12]=e,r[13]=t,r[14]=i),this}invert(){let e=this.elements,t=e[0],i=e[1],r=e[2],s=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8],u=e[9],f=e[10],d=e[11],g=e[12],y=e[13],m=e[14],p=e[15],b=u*m*c-y*f*c+y*l*d-o*m*d-u*l*p+o*f*p,_=g*f*c-h*m*c-g*l*d+a*m*d+h*l*p-a*f*p,v=h*y*c-g*u*c+g*o*d-a*y*d-h*o*p+a*u*p,E=g*u*l-h*y*l-g*o*f+a*y*f+h*o*m-a*u*m,A=t*b+i*_+r*v+s*E;if(A===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let P=1/A;return e[0]=b*P,e[1]=(y*f*s-u*m*s-y*r*d+i*m*d+u*r*p-i*f*p)*P,e[2]=(o*m*s-y*l*s+y*r*c-i*m*c-o*r*p+i*l*p)*P,e[3]=(u*l*s-o*f*s-u*r*c+i*f*c+o*r*d-i*l*d)*P,e[4]=_*P,e[5]=(h*m*s-g*f*s+g*r*d-t*m*d-h*r*p+t*f*p)*P,e[6]=(g*l*s-a*m*s-g*r*c+t*m*c+a*r*p-t*l*p)*P,e[7]=(a*f*s-h*l*s+h*r*c-t*f*c-a*r*d+t*l*d)*P,e[8]=v*P,e[9]=(g*u*s-h*y*s-g*i*d+t*y*d+h*i*p-t*u*p)*P,e[10]=(a*y*s-g*o*s+g*i*c-t*y*c-a*i*p+t*o*p)*P,e[11]=(h*o*s-a*u*s-h*i*c+t*u*c+a*i*d-t*o*d)*P,e[12]=E*P,e[13]=(h*y*r-g*u*r+g*i*f-t*y*f-h*i*m+t*u*m)*P,e[14]=(g*o*r-a*y*r-g*i*l+t*y*l+a*i*m-t*o*m)*P,e[15]=(a*u*r-h*o*r+h*i*l-t*u*l-a*i*f+t*o*f)*P,this}scale(e){let t=this.elements,i=e.x,r=e.y,s=e.z;return t[0]*=i,t[4]*=r,t[8]*=s,t[1]*=i,t[5]*=r,t[9]*=s,t[2]*=i,t[6]*=r,t[10]*=s,t[3]*=i,t[7]*=r,t[11]*=s,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],i=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],r=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,i,r))}makeTranslation(e,t,i){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,i,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),i=Math.sin(e);return this.set(1,0,0,0,0,t,-i,0,0,i,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),i=Math.sin(e);return this.set(t,0,i,0,0,1,0,0,-i,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),i=Math.sin(e);return this.set(t,-i,0,0,i,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let i=Math.cos(t),r=Math.sin(t),s=1-i,a=e.x,o=e.y,l=e.z,c=s*a,h=s*o;return this.set(c*a+i,c*o-r*l,c*l+r*o,0,c*o+r*l,h*o+i,h*l-r*a,0,c*l-r*o,h*l+r*a,s*l*l+i,0,0,0,0,1),this}makeScale(e,t,i){return this.set(e,0,0,0,0,t,0,0,0,0,i,0,0,0,0,1),this}makeShear(e,t,i,r,s,a){return this.set(1,i,s,0,e,1,a,0,t,r,1,0,0,0,0,1),this}compose(e,t,i){let r=this.elements,s=t._x,a=t._y,o=t._z,l=t._w,c=s+s,h=a+a,u=o+o,f=s*c,d=s*h,g=s*u,y=a*h,m=a*u,p=o*u,b=l*c,_=l*h,v=l*u,E=i.x,A=i.y,P=i.z;return r[0]=(1-(y+p))*E,r[1]=(d+v)*E,r[2]=(g-_)*E,r[3]=0,r[4]=(d-v)*A,r[5]=(1-(f+p))*A,r[6]=(m+b)*A,r[7]=0,r[8]=(g+_)*P,r[9]=(m-b)*P,r[10]=(1-(f+y))*P,r[11]=0,r[12]=e.x,r[13]=e.y,r[14]=e.z,r[15]=1,this}decompose(e,t,i){let r=this.elements,s=Hr.set(r[0],r[1],r[2]).length(),a=Hr.set(r[4],r[5],r[6]).length(),o=Hr.set(r[8],r[9],r[10]).length();this.determinant()<0&&(s=-s),e.x=r[12],e.y=r[13],e.z=r[14],In.copy(this);let c=1/s,h=1/a,u=1/o;return In.elements[0]*=c,In.elements[1]*=c,In.elements[2]*=c,In.elements[4]*=h,In.elements[5]*=h,In.elements[6]*=h,In.elements[8]*=u,In.elements[9]*=u,In.elements[10]*=u,t.setFromRotationMatrix(In),i.x=s,i.y=a,i.z=o,this}makePerspective(e,t,i,r,s,a,o=kn,l=!1){let c=this.elements,h=2*s/(t-e),u=2*s/(i-r),f=(t+e)/(t-e),d=(i+r)/(i-r),g,y;if(l)g=s/(a-s),y=a*s/(a-s);else if(o===kn)g=-(a+s)/(a-s),y=-2*a*s/(a-s);else if(o===Ks)g=-a/(a-s),y=-a*s/(a-s);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=f,c[12]=0,c[1]=0,c[5]=u,c[9]=d,c[13]=0,c[2]=0,c[6]=0,c[10]=g,c[14]=y,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,i,r,s,a,o=kn,l=!1){let c=this.elements,h=2/(t-e),u=2/(i-r),f=-(t+e)/(t-e),d=-(i+r)/(i-r),g,y;if(l)g=1/(a-s),y=a/(a-s);else if(o===kn)g=-2/(a-s),y=-(a+s)/(a-s);else if(o===Ks)g=-1/(a-s),y=-s/(a-s);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=0,c[12]=f,c[1]=0,c[5]=u,c[9]=0,c[13]=d,c[2]=0,c[6]=0,c[10]=g,c[14]=y,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){let t=this.elements,i=e.elements;for(let r=0;r<16;r++)if(t[r]!==i[r])return!1;return!0}fromArray(e,t=0){for(let i=0;i<16;i++)this.elements[i]=e[i+t];return this}toArray(e=[],t=0){let i=this.elements;return e[t]=i[0],e[t+1]=i[1],e[t+2]=i[2],e[t+3]=i[3],e[t+4]=i[4],e[t+5]=i[5],e[t+6]=i[6],e[t+7]=i[7],e[t+8]=i[8],e[t+9]=i[9],e[t+10]=i[10],e[t+11]=i[11],e[t+12]=i[12],e[t+13]=i[13],e[t+14]=i[14],e[t+15]=i[15],e}},Hr=new N,In=new bt,a0=new N(0,0,0),o0=new N(1,1,1),Ti=new N,bo=new N,fn=new N,uf=new bt,df=new Mn,qn=class n{constructor(e=0,t=0,i=0,r=n.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=i,this._order=r}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,i,r=this._order){return this._x=e,this._y=t,this._z=i,this._order=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,i=!0){let r=e.elements,s=r[0],a=r[4],o=r[8],l=r[1],c=r[5],h=r[9],u=r[2],f=r[6],d=r[10];switch(t){case"XYZ":this._y=Math.asin(Xe(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-h,d),this._z=Math.atan2(-a,s)):(this._x=Math.atan2(f,c),this._z=0);break;case"YXZ":this._x=Math.asin(-Xe(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(o,d),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-u,s),this._z=0);break;case"ZXY":this._x=Math.asin(Xe(f,-1,1)),Math.abs(f)<.9999999?(this._y=Math.atan2(-u,d),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(l,s));break;case"ZYX":this._y=Math.asin(-Xe(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(f,d),this._z=Math.atan2(l,s)):(this._x=0,this._z=Math.atan2(-a,c));break;case"YZX":this._z=Math.asin(Xe(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-u,s)):(this._x=0,this._y=Math.atan2(o,d));break;case"XZY":this._z=Math.asin(-Xe(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(f,c),this._y=Math.atan2(o,s)):(this._x=Math.atan2(-h,d),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,i===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,i){return uf.makeRotationFromQuaternion(e),this.setFromRotationMatrix(uf,t,i)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return df.setFromEuler(this),this.setFromQuaternion(df,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};qn.DEFAULT_ORDER="XYZ";var ta=class{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}},l0=0,ff=new N,Gr=new Mn,si=new bt,_o=new N,$s=new N,c0=new N,h0=new Mn,pf=new N(1,0,0),mf=new N(0,1,0),gf=new N(0,0,1),yf={type:"added"},u0={type:"removed"},Wr={type:"childadded",child:null},Mh={type:"childremoved",child:null},Ht=class n extends Xn{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:l0++}),this.uuid=li(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=n.DEFAULT_UP.clone();let e=new N,t=new qn,i=new Mn,r=new N(1,1,1);function s(){i.setFromEuler(t,!1)}function a(){t.setFromQuaternion(i,void 0,!1)}t._onChange(s),i._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:i},scale:{configurable:!0,enumerable:!0,value:r},modelViewMatrix:{value:new bt},normalMatrix:{value:new ze}}),this.matrix=new bt,this.matrixWorld=new bt,this.matrixAutoUpdate=n.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=n.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new ta,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return Gr.setFromAxisAngle(e,t),this.quaternion.multiply(Gr),this}rotateOnWorldAxis(e,t){return Gr.setFromAxisAngle(e,t),this.quaternion.premultiply(Gr),this}rotateX(e){return this.rotateOnAxis(pf,e)}rotateY(e){return this.rotateOnAxis(mf,e)}rotateZ(e){return this.rotateOnAxis(gf,e)}translateOnAxis(e,t){return ff.copy(e).applyQuaternion(this.quaternion),this.position.add(ff.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(pf,e)}translateY(e){return this.translateOnAxis(mf,e)}translateZ(e){return this.translateOnAxis(gf,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(si.copy(this.matrixWorld).invert())}lookAt(e,t,i){e.isVector3?_o.copy(e):_o.set(e,t,i);let r=this.parent;this.updateWorldMatrix(!0,!1),$s.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?si.lookAt($s,_o,this.up):si.lookAt(_o,$s,this.up),this.quaternion.setFromRotationMatrix(si),r&&(si.extractRotation(r.matrixWorld),Gr.setFromRotationMatrix(si),this.quaternion.premultiply(Gr.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(yf),Wr.child=e,this.dispatchEvent(Wr),Wr.child=null):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let i=0;i<arguments.length;i++)this.remove(arguments[i]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(u0),Mh.child=e,this.dispatchEvent(Mh),Mh.child=null),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),si.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),si.multiply(e.parent.matrixWorld)),e.applyMatrix4(si),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(yf),Wr.child=e,this.dispatchEvent(Wr),Wr.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let i=0,r=this.children.length;i<r;i++){let a=this.children[i].getObjectByProperty(e,t);if(a!==void 0)return a}}getObjectsByProperty(e,t,i=[]){this[e]===t&&i.push(this);let r=this.children;for(let s=0,a=r.length;s<a;s++)r[s].getObjectsByProperty(e,t,i);return i}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose($s,e,c0),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose($s,h0,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);let t=this.children;for(let i=0,r=t.length;i<r;i++)t[i].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let i=0,r=t.length;i<r;i++)t[i].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let i=0,r=t.length;i<r;i++)t[i].updateMatrixWorld(e)}updateWorldMatrix(e,t){let i=this.parent;if(e===!0&&i!==null&&i.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),t===!0){let r=this.children;for(let s=0,a=r.length;s<a;s++)r[s].updateWorldMatrix(!1,!0)}}toJSON(e){let t=e===void 0||typeof e=="string",i={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},i.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let r={};r.uuid=this.uuid,r.type=this.type,this.name!==""&&(r.name=this.name),this.castShadow===!0&&(r.castShadow=!0),this.receiveShadow===!0&&(r.receiveShadow=!0),this.visible===!1&&(r.visible=!1),this.frustumCulled===!1&&(r.frustumCulled=!1),this.renderOrder!==0&&(r.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(r.userData=this.userData),r.layers=this.layers.mask,r.matrix=this.matrix.toArray(),r.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(r.matrixAutoUpdate=!1),this.isInstancedMesh&&(r.type="InstancedMesh",r.count=this.count,r.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(r.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(r.type="BatchedMesh",r.perObjectFrustumCulled=this.perObjectFrustumCulled,r.sortObjects=this.sortObjects,r.drawRanges=this._drawRanges,r.reservedRanges=this._reservedRanges,r.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),r.instanceInfo=this._instanceInfo.map(o=>({...o})),r.availableInstanceIds=this._availableInstanceIds.slice(),r.availableGeometryIds=this._availableGeometryIds.slice(),r.nextIndexStart=this._nextIndexStart,r.nextVertexStart=this._nextVertexStart,r.geometryCount=this._geometryCount,r.maxInstanceCount=this._maxInstanceCount,r.maxVertexCount=this._maxVertexCount,r.maxIndexCount=this._maxIndexCount,r.geometryInitialized=this._geometryInitialized,r.matricesTexture=this._matricesTexture.toJSON(e),r.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(r.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(r.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(r.boundingBox=this.boundingBox.toJSON()));function s(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(e)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?r.background=this.background.toJSON():this.background.isTexture&&(r.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(r.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){r.geometry=s(e.geometries,this.geometry);let o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){let l=o.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){let u=l[c];s(e.shapes,u)}else s(e.shapes,l)}}if(this.isSkinnedMesh&&(r.bindMode=this.bindMode,r.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(s(e.skeletons,this.skeleton),r.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(s(e.materials,this.material[l]));r.material=o}else r.material=s(e.materials,this.material);if(this.children.length>0){r.children=[];for(let o=0;o<this.children.length;o++)r.children.push(this.children[o].toJSON(e).object)}if(this.animations.length>0){r.animations=[];for(let o=0;o<this.animations.length;o++){let l=this.animations[o];r.animations.push(s(e.animations,l))}}if(t){let o=a(e.geometries),l=a(e.materials),c=a(e.textures),h=a(e.images),u=a(e.shapes),f=a(e.skeletons),d=a(e.animations),g=a(e.nodes);o.length>0&&(i.geometries=o),l.length>0&&(i.materials=l),c.length>0&&(i.textures=c),h.length>0&&(i.images=h),u.length>0&&(i.shapes=u),f.length>0&&(i.skeletons=f),d.length>0&&(i.animations=d),g.length>0&&(i.nodes=g)}return i.object=r,i;function a(o){let l=[];for(let c in o){let h=o[c];delete h.metadata,l.push(h)}return l}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let i=0;i<e.children.length;i++){let r=e.children[i];this.add(r.clone())}return this}};Ht.DEFAULT_UP=new N(0,1,0);Ht.DEFAULT_MATRIX_AUTO_UPDATE=!0;Ht.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var Ln=new N,ai=new N,Eh=new N,oi=new N,$r=new N,Xr=new N,vf=new N,Th=new N,Ah=new N,Ch=new N,Rh=new ut,Ph=new ut,Ih=new ut,Ri=class n{constructor(e=new N,t=new N,i=new N){this.a=e,this.b=t,this.c=i}static getNormal(e,t,i,r){r.subVectors(i,t),Ln.subVectors(e,t),r.cross(Ln);let s=r.lengthSq();return s>0?r.multiplyScalar(1/Math.sqrt(s)):r.set(0,0,0)}static getBarycoord(e,t,i,r,s){Ln.subVectors(r,t),ai.subVectors(i,t),Eh.subVectors(e,t);let a=Ln.dot(Ln),o=Ln.dot(ai),l=Ln.dot(Eh),c=ai.dot(ai),h=ai.dot(Eh),u=a*c-o*o;if(u===0)return s.set(0,0,0),null;let f=1/u,d=(c*l-o*h)*f,g=(a*h-o*l)*f;return s.set(1-d-g,g,d)}static containsPoint(e,t,i,r){return this.getBarycoord(e,t,i,r,oi)===null?!1:oi.x>=0&&oi.y>=0&&oi.x+oi.y<=1}static getInterpolation(e,t,i,r,s,a,o,l){return this.getBarycoord(e,t,i,r,oi)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(s,oi.x),l.addScaledVector(a,oi.y),l.addScaledVector(o,oi.z),l)}static getInterpolatedAttribute(e,t,i,r,s,a){return Rh.setScalar(0),Ph.setScalar(0),Ih.setScalar(0),Rh.fromBufferAttribute(e,t),Ph.fromBufferAttribute(e,i),Ih.fromBufferAttribute(e,r),a.setScalar(0),a.addScaledVector(Rh,s.x),a.addScaledVector(Ph,s.y),a.addScaledVector(Ih,s.z),a}static isFrontFacing(e,t,i,r){return Ln.subVectors(i,t),ai.subVectors(e,t),Ln.cross(ai).dot(r)<0}set(e,t,i){return this.a.copy(e),this.b.copy(t),this.c.copy(i),this}setFromPointsAndIndices(e,t,i,r){return this.a.copy(e[t]),this.b.copy(e[i]),this.c.copy(e[r]),this}setFromAttributeAndIndices(e,t,i,r){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,i),this.c.fromBufferAttribute(e,r),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return Ln.subVectors(this.c,this.b),ai.subVectors(this.a,this.b),Ln.cross(ai).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return n.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return n.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,i,r,s){return n.getInterpolation(e,this.a,this.b,this.c,t,i,r,s)}containsPoint(e){return n.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return n.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let i=this.a,r=this.b,s=this.c,a,o;$r.subVectors(r,i),Xr.subVectors(s,i),Th.subVectors(e,i);let l=$r.dot(Th),c=Xr.dot(Th);if(l<=0&&c<=0)return t.copy(i);Ah.subVectors(e,r);let h=$r.dot(Ah),u=Xr.dot(Ah);if(h>=0&&u<=h)return t.copy(r);let f=l*u-h*c;if(f<=0&&l>=0&&h<=0)return a=l/(l-h),t.copy(i).addScaledVector($r,a);Ch.subVectors(e,s);let d=$r.dot(Ch),g=Xr.dot(Ch);if(g>=0&&d<=g)return t.copy(s);let y=d*c-l*g;if(y<=0&&c>=0&&g<=0)return o=c/(c-g),t.copy(i).addScaledVector(Xr,o);let m=h*g-d*u;if(m<=0&&u-h>=0&&d-g>=0)return vf.subVectors(s,r),o=(u-h)/(u-h+(d-g)),t.copy(r).addScaledVector(vf,o);let p=1/(m+y+f);return a=y*p,o=f*p,t.copy(i).addScaledVector($r,a).addScaledVector(Xr,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}},_p={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Ai={h:0,s:0,l:0},So={h:0,s:0,l:0};function Lh(n,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?n+(e-n)*6*t:t<1/2?e:t<2/3?n+(e-n)*6*(2/3-t):n}var Je=class{constructor(e,t,i){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,i)}set(e,t,i){if(t===void 0&&i===void 0){let r=e;r&&r.isColor?this.copy(r):typeof r=="number"?this.setHex(r):typeof r=="string"&&this.setStyle(r)}else this.setRGB(e,t,i);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=mn){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,Ke.colorSpaceToWorking(this,t),this}setRGB(e,t,i,r=Ke.workingColorSpace){return this.r=e,this.g=t,this.b=i,Ke.colorSpaceToWorking(this,r),this}setHSL(e,t,i,r=Ke.workingColorSpace){if(e=su(e,1),t=Xe(t,0,1),i=Xe(i,0,1),t===0)this.r=this.g=this.b=i;else{let s=i<=.5?i*(1+t):i+t-i*t,a=2*i-s;this.r=Lh(a,s,e+1/3),this.g=Lh(a,s,e),this.b=Lh(a,s,e-1/3)}return Ke.colorSpaceToWorking(this,r),this}setStyle(e,t=mn){function i(s){s!==void 0&&parseFloat(s)<1&&console.warn("THREE.Color: Alpha component of "+e+" will be ignored.")}let r;if(r=/^(\w+)\(([^\)]*)\)/.exec(e)){let s,a=r[1],o=r[2];switch(a){case"rgb":case"rgba":if(s=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return i(s[4]),this.setRGB(Math.min(255,parseInt(s[1],10))/255,Math.min(255,parseInt(s[2],10))/255,Math.min(255,parseInt(s[3],10))/255,t);if(s=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return i(s[4]),this.setRGB(Math.min(100,parseInt(s[1],10))/100,Math.min(100,parseInt(s[2],10))/100,Math.min(100,parseInt(s[3],10))/100,t);break;case"hsl":case"hsla":if(s=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return i(s[4]),this.setHSL(parseFloat(s[1])/360,parseFloat(s[2])/100,parseFloat(s[3])/100,t);break;default:console.warn("THREE.Color: Unknown color model "+e)}}else if(r=/^\#([A-Fa-f\d]+)$/.exec(e)){let s=r[1],a=s.length;if(a===3)return this.setRGB(parseInt(s.charAt(0),16)/15,parseInt(s.charAt(1),16)/15,parseInt(s.charAt(2),16)/15,t);if(a===6)return this.setHex(parseInt(s,16),t);console.warn("THREE.Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=mn){let i=_p[e.toLowerCase()];return i!==void 0?this.setHex(i,t):console.warn("THREE.Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=ci(e.r),this.g=ci(e.g),this.b=ci(e.b),this}copyLinearToSRGB(e){return this.r=Jr(e.r),this.g=Jr(e.g),this.b=Jr(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=mn){return Ke.workingToColorSpace(Yt.copy(this),e),Math.round(Xe(Yt.r*255,0,255))*65536+Math.round(Xe(Yt.g*255,0,255))*256+Math.round(Xe(Yt.b*255,0,255))}getHexString(e=mn){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=Ke.workingColorSpace){Ke.workingToColorSpace(Yt.copy(this),t);let i=Yt.r,r=Yt.g,s=Yt.b,a=Math.max(i,r,s),o=Math.min(i,r,s),l,c,h=(o+a)/2;if(o===a)l=0,c=0;else{let u=a-o;switch(c=h<=.5?u/(a+o):u/(2-a-o),a){case i:l=(r-s)/u+(r<s?6:0);break;case r:l=(s-i)/u+2;break;case s:l=(i-r)/u+4;break}l/=6}return e.h=l,e.s=c,e.l=h,e}getRGB(e,t=Ke.workingColorSpace){return Ke.workingToColorSpace(Yt.copy(this),t),e.r=Yt.r,e.g=Yt.g,e.b=Yt.b,e}getStyle(e=mn){Ke.workingToColorSpace(Yt.copy(this),e);let t=Yt.r,i=Yt.g,r=Yt.b;return e!==mn?`color(${e} ${t.toFixed(3)} ${i.toFixed(3)} ${r.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(i*255)},${Math.round(r*255)})`}offsetHSL(e,t,i){return this.getHSL(Ai),this.setHSL(Ai.h+e,Ai.s+t,Ai.l+i)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,i){return this.r=e.r+(t.r-e.r)*i,this.g=e.g+(t.g-e.g)*i,this.b=e.b+(t.b-e.b)*i,this}lerpHSL(e,t){this.getHSL(Ai),e.getHSL(So);let i=js(Ai.h,So.h,t),r=js(Ai.s,So.s,t),s=js(Ai.l,So.l,t);return this.setHSL(i,r,s),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,i=this.g,r=this.b,s=e.elements;return this.r=s[0]*t+s[3]*i+s[6]*r,this.g=s[1]*t+s[4]*i+s[7]*r,this.b=s[2]*t+s[5]*i+s[8]*r,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Yt=new Je;Je.NAMES=_p;var d0=0,di=class extends Xn{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:d0++}),this.uuid=li(),this.name="",this.type="Material",this.blending=lr,this.side=hi,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=Fo,this.blendDst=Bo,this.blendEquation=Ii,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Je(0,0,0),this.blendAlpha=0,this.depthFunc=cr,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=zh,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=or,this.stencilZFail=or,this.stencilZPass=or,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let i=e[t];if(i===void 0){console.warn(`THREE.Material: parameter '${t}' has value of undefined.`);continue}let r=this[t];if(r===void 0){console.warn(`THREE.Material: '${t}' is not a property of THREE.${this.type}.`);continue}r&&r.isColor?r.set(i):r&&r.isVector3&&i&&i.isVector3?r.copy(i):this[t]=i}}toJSON(e){let t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});let i={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.color&&this.color.isColor&&(i.color=this.color.getHex()),this.roughness!==void 0&&(i.roughness=this.roughness),this.metalness!==void 0&&(i.metalness=this.metalness),this.sheen!==void 0&&(i.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(i.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(i.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(i.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(i.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(i.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(i.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(i.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(i.shininess=this.shininess),this.clearcoat!==void 0&&(i.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(i.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(i.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(i.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(i.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,i.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(i.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(i.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(i.dispersion=this.dispersion),this.iridescence!==void 0&&(i.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(i.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(i.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(i.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(i.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(i.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(i.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(i.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(i.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(i.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(i.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(i.lightMap=this.lightMap.toJSON(e).uuid,i.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(i.aoMap=this.aoMap.toJSON(e).uuid,i.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(i.bumpMap=this.bumpMap.toJSON(e).uuid,i.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(i.normalMap=this.normalMap.toJSON(e).uuid,i.normalMapType=this.normalMapType,i.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(i.displacementMap=this.displacementMap.toJSON(e).uuid,i.displacementScale=this.displacementScale,i.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(i.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(i.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(i.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(i.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(i.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(i.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(i.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(i.combine=this.combine)),this.envMapRotation!==void 0&&(i.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(i.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(i.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(i.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(i.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(i.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(i.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(i.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(i.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(i.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(i.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(i.size=this.size),this.shadowSide!==null&&(i.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(i.sizeAttenuation=this.sizeAttenuation),this.blending!==lr&&(i.blending=this.blending),this.side!==hi&&(i.side=this.side),this.vertexColors===!0&&(i.vertexColors=!0),this.opacity<1&&(i.opacity=this.opacity),this.transparent===!0&&(i.transparent=!0),this.blendSrc!==Fo&&(i.blendSrc=this.blendSrc),this.blendDst!==Bo&&(i.blendDst=this.blendDst),this.blendEquation!==Ii&&(i.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(i.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(i.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(i.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(i.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(i.blendAlpha=this.blendAlpha),this.depthFunc!==cr&&(i.depthFunc=this.depthFunc),this.depthTest===!1&&(i.depthTest=this.depthTest),this.depthWrite===!1&&(i.depthWrite=this.depthWrite),this.colorWrite===!1&&(i.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(i.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==zh&&(i.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(i.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(i.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==or&&(i.stencilFail=this.stencilFail),this.stencilZFail!==or&&(i.stencilZFail=this.stencilZFail),this.stencilZPass!==or&&(i.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(i.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(i.rotation=this.rotation),this.polygonOffset===!0&&(i.polygonOffset=!0),this.polygonOffsetFactor!==0&&(i.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(i.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(i.linewidth=this.linewidth),this.dashSize!==void 0&&(i.dashSize=this.dashSize),this.gapSize!==void 0&&(i.gapSize=this.gapSize),this.scale!==void 0&&(i.scale=this.scale),this.dithering===!0&&(i.dithering=!0),this.alphaTest>0&&(i.alphaTest=this.alphaTest),this.alphaHash===!0&&(i.alphaHash=!0),this.alphaToCoverage===!0&&(i.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(i.premultipliedAlpha=!0),this.forceSinglePass===!0&&(i.forceSinglePass=!0),this.wireframe===!0&&(i.wireframe=!0),this.wireframeLinewidth>1&&(i.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(i.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(i.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(i.flatShading=!0),this.visible===!1&&(i.visible=!1),this.toneMapped===!1&&(i.toneMapped=!1),this.fog===!1&&(i.fog=!1),Object.keys(this.userData).length>0&&(i.userData=this.userData);function r(s){let a=[];for(let o in s){let l=s[o];delete l.metadata,a.push(l)}return a}if(t){let s=r(e.textures),a=r(e.images);s.length>0&&(i.textures=s),a.length>0&&(i.images=a)}return i}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,i=null;if(t!==null){let r=t.length;i=new Array(r);for(let s=0;s!==r;++s)i[s]=t[s].clone()}return this.clippingPlanes=i,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}},na=class extends di{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Je(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new qn,this.combine=Yh,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}};var At=new N,wo=new Le,f0=0,St=class{constructor(e,t,i=!1){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:f0++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=i,this.usage=Go,this.updateRanges=[],this.gpuType=Cn,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,i){e*=this.itemSize,i*=t.itemSize;for(let r=0,s=this.itemSize;r<s;r++)this.array[e+r]=t.array[i+r];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,i=this.count;t<i;t++)wo.fromBufferAttribute(this,t),wo.applyMatrix3(e),this.setXY(t,wo.x,wo.y);else if(this.itemSize===3)for(let t=0,i=this.count;t<i;t++)At.fromBufferAttribute(this,t),At.applyMatrix3(e),this.setXYZ(t,At.x,At.y,At.z);return this}applyMatrix4(e){for(let t=0,i=this.count;t<i;t++)At.fromBufferAttribute(this,t),At.applyMatrix4(e),this.setXYZ(t,At.x,At.y,At.z);return this}applyNormalMatrix(e){for(let t=0,i=this.count;t<i;t++)At.fromBufferAttribute(this,t),At.applyNormalMatrix(e),this.setXYZ(t,At.x,At.y,At.z);return this}transformDirection(e){for(let t=0,i=this.count;t<i;t++)At.fromBufferAttribute(this,t),At.transformDirection(e),this.setXYZ(t,At.x,At.y,At.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let i=this.array[e*this.itemSize+t];return this.normalized&&(i=Dn(i,this.array)),i}setComponent(e,t,i){return this.normalized&&(i=st(i,this.array)),this.array[e*this.itemSize+t]=i,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=Dn(t,this.array)),t}setX(e,t){return this.normalized&&(t=st(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=Dn(t,this.array)),t}setY(e,t){return this.normalized&&(t=st(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=Dn(t,this.array)),t}setZ(e,t){return this.normalized&&(t=st(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=Dn(t,this.array)),t}setW(e,t){return this.normalized&&(t=st(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,i){return e*=this.itemSize,this.normalized&&(t=st(t,this.array),i=st(i,this.array)),this.array[e+0]=t,this.array[e+1]=i,this}setXYZ(e,t,i,r){return e*=this.itemSize,this.normalized&&(t=st(t,this.array),i=st(i,this.array),r=st(r,this.array)),this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=r,this}setXYZW(e,t,i,r,s){return e*=this.itemSize,this.normalized&&(t=st(t,this.array),i=st(i,this.array),r=st(r,this.array),s=st(s,this.array)),this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=r,this.array[e+3]=s,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==Go&&(e.usage=this.usage),e}};var ia=class extends St{constructor(e,t,i){super(new Uint16Array(e),t,i)}};var ra=class extends St{constructor(e,t,i){super(new Uint32Array(e),t,i)}};var Xt=class extends St{constructor(e,t,i){super(new Float32Array(e),t,i)}},p0=0,Sn=new bt,Dh=new Ht,qr=new N,pn=new On,Xs=new On,zt=new N,wt=class n extends Xn{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:p0++}),this.uuid=li(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(ou(e)?ra:ia)(e,1):this.index=e,this}setIndirect(e){return this.indirect=e,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,i=0){this.groups.push({start:e,count:t,materialIndex:i})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let i=this.attributes.normal;if(i!==void 0){let s=new ze().getNormalMatrix(e);i.applyNormalMatrix(s),i.needsUpdate=!0}let r=this.attributes.tangent;return r!==void 0&&(r.transformDirection(e),r.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(e){return Sn.makeRotationFromQuaternion(e),this.applyMatrix4(Sn),this}rotateX(e){return Sn.makeRotationX(e),this.applyMatrix4(Sn),this}rotateY(e){return Sn.makeRotationY(e),this.applyMatrix4(Sn),this}rotateZ(e){return Sn.makeRotationZ(e),this.applyMatrix4(Sn),this}translate(e,t,i){return Sn.makeTranslation(e,t,i),this.applyMatrix4(Sn),this}scale(e,t,i){return Sn.makeScale(e,t,i),this.applyMatrix4(Sn),this}lookAt(e){return Dh.lookAt(e),Dh.updateMatrix(),this.applyMatrix4(Dh.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(qr).negate(),this.translate(qr.x,qr.y,qr.z),this}setFromPoints(e){let t=this.getAttribute("position");if(t===void 0){let i=[];for(let r=0,s=e.length;r<s;r++){let a=e[r];i.push(a.x,a.y,a.z||0)}this.setAttribute("position",new Xt(i,3))}else{let i=Math.min(e.length,t.count);for(let r=0;r<i;r++){let s=e[r];t.setXYZ(r,s.x,s.y,s.z||0)}e.length>t.count&&console.warn("THREE.BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new On);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new N(-1/0,-1/0,-1/0),new N(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let i=0,r=t.length;i<r;i++){let s=t[i];pn.setFromBufferAttribute(s),this.morphTargetsRelative?(zt.addVectors(this.boundingBox.min,pn.min),this.boundingBox.expandByPoint(zt),zt.addVectors(this.boundingBox.max,pn.max),this.boundingBox.expandByPoint(zt)):(this.boundingBox.expandByPoint(pn.min),this.boundingBox.expandByPoint(pn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Li);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new N,1/0);return}if(e){let i=this.boundingSphere.center;if(pn.setFromBufferAttribute(e),t)for(let s=0,a=t.length;s<a;s++){let o=t[s];Xs.setFromBufferAttribute(o),this.morphTargetsRelative?(zt.addVectors(pn.min,Xs.min),pn.expandByPoint(zt),zt.addVectors(pn.max,Xs.max),pn.expandByPoint(zt)):(pn.expandByPoint(Xs.min),pn.expandByPoint(Xs.max))}pn.getCenter(i);let r=0;for(let s=0,a=e.count;s<a;s++)zt.fromBufferAttribute(e,s),r=Math.max(r,i.distanceToSquared(zt));if(t)for(let s=0,a=t.length;s<a;s++){let o=t[s],l=this.morphTargetsRelative;for(let c=0,h=o.count;c<h;c++)zt.fromBufferAttribute(o,c),l&&(qr.fromBufferAttribute(e,c),zt.add(qr)),r=Math.max(r,i.distanceToSquared(zt))}this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let i=t.position,r=t.normal,s=t.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new St(new Float32Array(4*i.count),4));let a=this.getAttribute("tangent"),o=[],l=[];for(let k=0;k<i.count;k++)o[k]=new N,l[k]=new N;let c=new N,h=new N,u=new N,f=new Le,d=new Le,g=new Le,y=new N,m=new N;function p(k,w,M){c.fromBufferAttribute(i,k),h.fromBufferAttribute(i,w),u.fromBufferAttribute(i,M),f.fromBufferAttribute(s,k),d.fromBufferAttribute(s,w),g.fromBufferAttribute(s,M),h.sub(c),u.sub(c),d.sub(f),g.sub(f);let L=1/(d.x*g.y-g.x*d.y);isFinite(L)&&(y.copy(h).multiplyScalar(g.y).addScaledVector(u,-d.y).multiplyScalar(L),m.copy(u).multiplyScalar(d.x).addScaledVector(h,-g.x).multiplyScalar(L),o[k].add(y),o[w].add(y),o[M].add(y),l[k].add(m),l[w].add(m),l[M].add(m))}let b=this.groups;b.length===0&&(b=[{start:0,count:e.count}]);for(let k=0,w=b.length;k<w;++k){let M=b[k],L=M.start,V=M.count;for(let W=L,Y=L+V;W<Y;W+=3)p(e.getX(W+0),e.getX(W+1),e.getX(W+2))}let _=new N,v=new N,E=new N,A=new N;function P(k){E.fromBufferAttribute(r,k),A.copy(E);let w=o[k];_.copy(w),_.sub(E.multiplyScalar(E.dot(w))).normalize(),v.crossVectors(A,w);let L=v.dot(l[k])<0?-1:1;a.setXYZW(k,_.x,_.y,_.z,L)}for(let k=0,w=b.length;k<w;++k){let M=b[k],L=M.start,V=M.count;for(let W=L,Y=L+V;W<Y;W+=3)P(e.getX(W+0)),P(e.getX(W+1)),P(e.getX(W+2))}}computeVertexNormals(){let e=this.index,t=this.getAttribute("position");if(t!==void 0){let i=this.getAttribute("normal");if(i===void 0)i=new St(new Float32Array(t.count*3),3),this.setAttribute("normal",i);else for(let f=0,d=i.count;f<d;f++)i.setXYZ(f,0,0,0);let r=new N,s=new N,a=new N,o=new N,l=new N,c=new N,h=new N,u=new N;if(e)for(let f=0,d=e.count;f<d;f+=3){let g=e.getX(f+0),y=e.getX(f+1),m=e.getX(f+2);r.fromBufferAttribute(t,g),s.fromBufferAttribute(t,y),a.fromBufferAttribute(t,m),h.subVectors(a,s),u.subVectors(r,s),h.cross(u),o.fromBufferAttribute(i,g),l.fromBufferAttribute(i,y),c.fromBufferAttribute(i,m),o.add(h),l.add(h),c.add(h),i.setXYZ(g,o.x,o.y,o.z),i.setXYZ(y,l.x,l.y,l.z),i.setXYZ(m,c.x,c.y,c.z)}else for(let f=0,d=t.count;f<d;f+=3)r.fromBufferAttribute(t,f+0),s.fromBufferAttribute(t,f+1),a.fromBufferAttribute(t,f+2),h.subVectors(a,s),u.subVectors(r,s),h.cross(u),i.setXYZ(f+0,h.x,h.y,h.z),i.setXYZ(f+1,h.x,h.y,h.z),i.setXYZ(f+2,h.x,h.y,h.z);this.normalizeNormals(),i.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,i=e.count;t<i;t++)zt.fromBufferAttribute(e,t),zt.normalize(),e.setXYZ(t,zt.x,zt.y,zt.z)}toNonIndexed(){function e(o,l){let c=o.array,h=o.itemSize,u=o.normalized,f=new c.constructor(l.length*h),d=0,g=0;for(let y=0,m=l.length;y<m;y++){o.isInterleavedBufferAttribute?d=l[y]*o.data.stride+o.offset:d=l[y]*h;for(let p=0;p<h;p++)f[g++]=c[d++]}return new St(f,h,u)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let t=new n,i=this.index.array,r=this.attributes;for(let o in r){let l=r[o],c=e(l,i);t.setAttribute(o,c)}let s=this.morphAttributes;for(let o in s){let l=[],c=s[o];for(let h=0,u=c.length;h<u;h++){let f=c[h],d=e(f,i);l.push(d)}t.morphAttributes[o]=l}t.morphTargetsRelative=this.morphTargetsRelative;let a=this.groups;for(let o=0,l=a.length;o<l;o++){let c=a[o];t.addGroup(c.start,c.count,c.materialIndex)}return t}toJSON(){let e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){let l=this.parameters;for(let c in l)l[c]!==void 0&&(e[c]=l[c]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let i=this.attributes;for(let l in i){let c=i[l];e.data.attributes[l]=c.toJSON(e.data)}let r={},s=!1;for(let l in this.morphAttributes){let c=this.morphAttributes[l],h=[];for(let u=0,f=c.length;u<f;u++){let d=c[u];h.push(d.toJSON(e.data))}h.length>0&&(r[l]=h,s=!0)}s&&(e.data.morphAttributes=r,e.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));let o=this.boundingSphere;return o!==null&&(e.data.boundingSphere=o.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let i=e.index;i!==null&&this.setIndex(i.clone());let r=e.attributes;for(let c in r){let h=r[c];this.setAttribute(c,h.clone(t))}let s=e.morphAttributes;for(let c in s){let h=[],u=s[c];for(let f=0,d=u.length;f<d;f++)h.push(u[f].clone(t));this.morphAttributes[c]=h}this.morphTargetsRelative=e.morphTargetsRelative;let a=e.groups;for(let c=0,h=a.length;c<h;c++){let u=a[c];this.addGroup(u.start,u.count,u.materialIndex)}let o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());let l=e.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}},xf=new bt,sr=new Di,Mo=new Li,bf=new N,Eo=new N,To=new N,Ao=new N,kh=new N,Co=new N,_f=new N,Ro=new N,It=class extends Ht{constructor(e=new wt,t=new na){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let t=this.geometry.morphAttributes,i=Object.keys(t);if(i.length>0){let r=t[i[0]];if(r!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let s=0,a=r.length;s<a;s++){let o=r[s].name||String(s);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=s}}}}getVertexPosition(e,t){let i=this.geometry,r=i.attributes.position,s=i.morphAttributes.position,a=i.morphTargetsRelative;t.fromBufferAttribute(r,e);let o=this.morphTargetInfluences;if(s&&o){Co.set(0,0,0);for(let l=0,c=s.length;l<c;l++){let h=o[l],u=s[l];h!==0&&(kh.fromBufferAttribute(u,e),a?Co.addScaledVector(kh,h):Co.addScaledVector(kh.sub(t),h))}t.add(Co)}return t}raycast(e,t){let i=this.geometry,r=this.material,s=this.matrixWorld;r!==void 0&&(i.boundingSphere===null&&i.computeBoundingSphere(),Mo.copy(i.boundingSphere),Mo.applyMatrix4(s),sr.copy(e.ray).recast(e.near),!(Mo.containsPoint(sr.origin)===!1&&(sr.intersectSphere(Mo,bf)===null||sr.origin.distanceToSquared(bf)>(e.far-e.near)**2))&&(xf.copy(s).invert(),sr.copy(e.ray).applyMatrix4(xf),!(i.boundingBox!==null&&sr.intersectsBox(i.boundingBox)===!1)&&this._computeIntersections(e,t,sr)))}_computeIntersections(e,t,i){let r,s=this.geometry,a=this.material,o=s.index,l=s.attributes.position,c=s.attributes.uv,h=s.attributes.uv1,u=s.attributes.normal,f=s.groups,d=s.drawRange;if(o!==null)if(Array.isArray(a))for(let g=0,y=f.length;g<y;g++){let m=f[g],p=a[m.materialIndex],b=Math.max(m.start,d.start),_=Math.min(o.count,Math.min(m.start+m.count,d.start+d.count));for(let v=b,E=_;v<E;v+=3){let A=o.getX(v),P=o.getX(v+1),k=o.getX(v+2);r=Po(this,p,e,i,c,h,u,A,P,k),r&&(r.faceIndex=Math.floor(v/3),r.face.materialIndex=m.materialIndex,t.push(r))}}else{let g=Math.max(0,d.start),y=Math.min(o.count,d.start+d.count);for(let m=g,p=y;m<p;m+=3){let b=o.getX(m),_=o.getX(m+1),v=o.getX(m+2);r=Po(this,a,e,i,c,h,u,b,_,v),r&&(r.faceIndex=Math.floor(m/3),t.push(r))}}else if(l!==void 0)if(Array.isArray(a))for(let g=0,y=f.length;g<y;g++){let m=f[g],p=a[m.materialIndex],b=Math.max(m.start,d.start),_=Math.min(l.count,Math.min(m.start+m.count,d.start+d.count));for(let v=b,E=_;v<E;v+=3){let A=v,P=v+1,k=v+2;r=Po(this,p,e,i,c,h,u,A,P,k),r&&(r.faceIndex=Math.floor(v/3),r.face.materialIndex=m.materialIndex,t.push(r))}}else{let g=Math.max(0,d.start),y=Math.min(l.count,d.start+d.count);for(let m=g,p=y;m<p;m+=3){let b=m,_=m+1,v=m+2;r=Po(this,a,e,i,c,h,u,b,_,v),r&&(r.faceIndex=Math.floor(m/3),t.push(r))}}}};function m0(n,e,t,i,r,s,a,o){let l;if(e.side===en?l=i.intersectTriangle(a,s,r,!0,o):l=i.intersectTriangle(r,s,a,e.side===hi,o),l===null)return null;Ro.copy(o),Ro.applyMatrix4(n.matrixWorld);let c=t.ray.origin.distanceTo(Ro);return c<t.near||c>t.far?null:{distance:c,point:Ro.clone(),object:n}}function Po(n,e,t,i,r,s,a,o,l,c){n.getVertexPosition(o,Eo),n.getVertexPosition(l,To),n.getVertexPosition(c,Ao);let h=m0(n,e,t,i,Eo,To,Ao,_f);if(h){let u=new N;Ri.getBarycoord(_f,Eo,To,Ao,u),r&&(h.uv=Ri.getInterpolatedAttribute(r,o,l,c,u,new Le)),s&&(h.uv1=Ri.getInterpolatedAttribute(s,o,l,c,u,new Le)),a&&(h.normal=Ri.getInterpolatedAttribute(a,o,l,c,u,new N),h.normal.dot(i.direction)>0&&h.normal.multiplyScalar(-1));let f={a:o,b:l,c,normal:new N,materialIndex:0};Ri.getNormal(Eo,To,Ao,f.normal),h.face=f,h.barycoord=u}return h}var ts=class n extends wt{constructor(e=1,t=1,i=1,r=1,s=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:i,widthSegments:r,heightSegments:s,depthSegments:a};let o=this;r=Math.floor(r),s=Math.floor(s),a=Math.floor(a);let l=[],c=[],h=[],u=[],f=0,d=0;g("z","y","x",-1,-1,i,t,e,a,s,0),g("z","y","x",1,-1,i,t,-e,a,s,1),g("x","z","y",1,1,e,i,t,r,a,2),g("x","z","y",1,-1,e,i,-t,r,a,3),g("x","y","z",1,-1,e,t,i,r,s,4),g("x","y","z",-1,-1,e,t,-i,r,s,5),this.setIndex(l),this.setAttribute("position",new Xt(c,3)),this.setAttribute("normal",new Xt(h,3)),this.setAttribute("uv",new Xt(u,2));function g(y,m,p,b,_,v,E,A,P,k,w){let M=v/P,L=E/k,V=v/2,W=E/2,Y=A/2,j=P+1,X=k+1,re=0,H=0,oe=new N;for(let ee=0;ee<X;ee++){let Me=ee*L-W;for(let $e=0;$e<j;$e++){let rt=$e*M-V;oe[y]=rt*b,oe[m]=Me*_,oe[p]=Y,c.push(oe.x,oe.y,oe.z),oe[y]=0,oe[m]=0,oe[p]=A>0?1:-1,h.push(oe.x,oe.y,oe.z),u.push($e/P),u.push(1-ee/k),re+=1}}for(let ee=0;ee<k;ee++)for(let Me=0;Me<P;Me++){let $e=f+Me+j*ee,rt=f+Me+j*(ee+1),Ue=f+(Me+1)+j*(ee+1),qe=f+(Me+1)+j*ee;l.push($e,rt,qe),l.push(rt,Ue,qe),H+=6}o.addGroup(d,H,w),d+=H,f+=re}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new n(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}};function yr(n){let e={};for(let t in n){e[t]={};for(let i in n[t]){let r=n[t][i];r&&(r.isColor||r.isMatrix3||r.isMatrix4||r.isVector2||r.isVector3||r.isVector4||r.isTexture||r.isQuaternion)?r.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][i]=null):e[t][i]=r.clone():Array.isArray(r)?e[t][i]=r.slice():e[t][i]=r}}return e}function jt(n){let e={};for(let t=0;t<n.length;t++){let i=yr(n[t]);for(let r in i)e[r]=i[r]}return e}function g0(n){let e=[];for(let t=0;t<n.length;t++)e.push(n[t].clone());return e}function lu(n){let e=n.getRenderTarget();return e===null?n.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:Ke.workingColorSpace}var Sp={clone:yr,merge:jt},y0=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,v0=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,an=class extends di{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=y0,this.fragmentShader=v0,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=yr(e.uniforms),this.uniformsGroups=g0(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let r in this.uniforms){let a=this.uniforms[r].value;a&&a.isTexture?t.uniforms[r]={type:"t",value:a.toJSON(e).uuid}:a&&a.isColor?t.uniforms[r]={type:"c",value:a.getHex()}:a&&a.isVector2?t.uniforms[r]={type:"v2",value:a.toArray()}:a&&a.isVector3?t.uniforms[r]={type:"v3",value:a.toArray()}:a&&a.isVector4?t.uniforms[r]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?t.uniforms[r]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?t.uniforms[r]={type:"m4",value:a.toArray()}:t.uniforms[r]={value:a}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let i={};for(let r in this.extensions)this.extensions[r]===!0&&(i[r]=!0);return Object.keys(i).length>0&&(t.extensions=i),t}},sa=class extends Ht{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new bt,this.projectionMatrix=new bt,this.projectionMatrixInverse=new bt,this.coordinateSystem=kn,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}},Ci=new N,Sf=new Le,wf=new Le,$t=class extends sa{constructor(e=50,t=1,i=.1,r=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=i,this.far=r,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=Kr*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(Ys*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return Kr*2*Math.atan(Math.tan(Ys*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,i){Ci.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(Ci.x,Ci.y).multiplyScalar(-e/Ci.z),Ci.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),i.set(Ci.x,Ci.y).multiplyScalar(-e/Ci.z)}getViewSize(e,t){return this.getViewBounds(e,Sf,wf),t.subVectors(wf,Sf)}setViewOffset(e,t,i,r,s,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=r,this.view.width=s,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(Ys*.5*this.fov)/this.zoom,i=2*t,r=this.aspect*i,s=-.5*r,a=this.view;if(this.view!==null&&this.view.enabled){let l=a.fullWidth,c=a.fullHeight;s+=a.offsetX*r/l,t-=a.offsetY*i/c,r*=a.width/l,i*=a.height/c}let o=this.filmOffset;o!==0&&(s+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(s,s+r,t,t-i,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}},Yr=-90,jr=1,qo=class extends Ht{constructor(e,t,i){super(),this.type="CubeCamera",this.renderTarget=i,this.coordinateSystem=null,this.activeMipmapLevel=0;let r=new $t(Yr,jr,e,t);r.layers=this.layers,this.add(r);let s=new $t(Yr,jr,e,t);s.layers=this.layers,this.add(s);let a=new $t(Yr,jr,e,t);a.layers=this.layers,this.add(a);let o=new $t(Yr,jr,e,t);o.layers=this.layers,this.add(o);let l=new $t(Yr,jr,e,t);l.layers=this.layers,this.add(l);let c=new $t(Yr,jr,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[i,r,s,a,o,l]=t;for(let c of t)this.remove(c);if(e===kn)i.up.set(0,1,0),i.lookAt(1,0,0),r.up.set(0,1,0),r.lookAt(-1,0,0),s.up.set(0,0,-1),s.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(e===Ks)i.up.set(0,-1,0),i.lookAt(-1,0,0),r.up.set(0,-1,0),r.lookAt(1,0,0),s.up.set(0,0,1),s.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(let c of t)this.add(c),c.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let{renderTarget:i,activeMipmapLevel:r}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[s,a,o,l,c,h]=this.children,u=e.getRenderTarget(),f=e.getActiveCubeFace(),d=e.getActiveMipmapLevel(),g=e.xr.enabled;e.xr.enabled=!1;let y=i.texture.generateMipmaps;i.texture.generateMipmaps=!1,e.setRenderTarget(i,0,r),e.render(t,s),e.setRenderTarget(i,1,r),e.render(t,a),e.setRenderTarget(i,2,r),e.render(t,o),e.setRenderTarget(i,3,r),e.render(t,l),e.setRenderTarget(i,4,r),e.render(t,c),i.texture.generateMipmaps=y,e.setRenderTarget(i,5,r),e.render(t,h),e.setRenderTarget(u,f,d),e.xr.enabled=g,i.texture.needsPMREMUpdate=!0}},aa=class extends Qt{constructor(e=[],t=mr,i,r,s,a,o,l,c,h){super(e,t,i,r,s,a,o,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}},Yo=class extends En{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let i={width:e,height:e,depth:1},r=[i,i,i,i,i,i];this.texture=new aa(r),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let i={uniforms:{tEquirect:{value:null}},vertexShader:`

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
			`},r=new ts(5,5,5),s=new an({name:"CubemapFromEquirect",uniforms:yr(i.uniforms),vertexShader:i.vertexShader,fragmentShader:i.fragmentShader,side:en,blending:Bn});s.uniforms.tEquirect.value=t;let a=new It(r,s),o=t.minFilter;return t.minFilter===Ui&&(t.minFilter=Nn),new qo(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,i=!0,r=!0){let s=e.getRenderTarget();for(let a=0;a<6;a++)e.setRenderTarget(this,a),e.clear(t,i,r);e.setRenderTarget(s)}},gn=class extends Ht{constructor(){super(),this.isGroup=!0,this.type="Group"}},x0={type:"move"},ns=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new gn,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new gn,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new N,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new N),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new gn,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new N,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new N),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let i of e.hand.values())this._getHandJoint(t,i)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,i){let r=null,s=null,a=null,o=this._targetRay,l=this._grip,c=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(c&&e.hand){a=!0;for(let y of e.hand.values()){let m=t.getJointPose(y,i),p=this._getHandJoint(c,y);m!==null&&(p.matrix.fromArray(m.transform.matrix),p.matrix.decompose(p.position,p.rotation,p.scale),p.matrixWorldNeedsUpdate=!0,p.jointRadius=m.radius),p.visible=m!==null}let h=c.joints["index-finger-tip"],u=c.joints["thumb-tip"],f=h.position.distanceTo(u.position),d=.02,g=.005;c.inputState.pinching&&f>d+g?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!c.inputState.pinching&&f<=d-g&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else l!==null&&e.gripSpace&&(s=t.getPose(e.gripSpace,i),s!==null&&(l.matrix.fromArray(s.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,s.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(s.linearVelocity)):l.hasLinearVelocity=!1,s.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(s.angularVelocity)):l.hasAngularVelocity=!1));o!==null&&(r=t.getPose(e.targetRaySpace,i),r===null&&s!==null&&(r=s),r!==null&&(o.matrix.fromArray(r.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,r.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(r.linearVelocity)):o.hasLinearVelocity=!1,r.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(r.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(x0)))}return o!==null&&(o.visible=r!==null),l!==null&&(l.visible=s!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let i=new gn;i.matrixAutoUpdate=!1,i.visible=!1,e.joints[t.jointName]=i,e.add(i)}return e.joints[t.jointName]}};var hr=class extends Ht{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new qn,this.environmentIntensity=1,this.environmentRotation=new qn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}},jo=class{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=Go,this.updateRanges=[],this.version=0,this.uuid=li()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,i){e*=this.stride,i*=t.stride;for(let r=0,s=this.stride;r<s;r++)this.array[e+r]=t.array[i+r];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=li()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);let t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),i=new this.constructor(t,this.stride);return i.setUsage(this.usage),i}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){return e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=li()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}},Kt=new N,Gt=class n{constructor(e,t,i,r=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=i,this.normalized=r}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,i=this.data.count;t<i;t++)Kt.fromBufferAttribute(this,t),Kt.applyMatrix4(e),this.setXYZ(t,Kt.x,Kt.y,Kt.z);return this}applyNormalMatrix(e){for(let t=0,i=this.count;t<i;t++)Kt.fromBufferAttribute(this,t),Kt.applyNormalMatrix(e),this.setXYZ(t,Kt.x,Kt.y,Kt.z);return this}transformDirection(e){for(let t=0,i=this.count;t<i;t++)Kt.fromBufferAttribute(this,t),Kt.transformDirection(e),this.setXYZ(t,Kt.x,Kt.y,Kt.z);return this}getComponent(e,t){let i=this.array[e*this.data.stride+this.offset+t];return this.normalized&&(i=Dn(i,this.array)),i}setComponent(e,t,i){return this.normalized&&(i=st(i,this.array)),this.data.array[e*this.data.stride+this.offset+t]=i,this}setX(e,t){return this.normalized&&(t=st(t,this.array)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=st(t,this.array)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=st(t,this.array)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=st(t,this.array)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=Dn(t,this.array)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=Dn(t,this.array)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=Dn(t,this.array)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=Dn(t,this.array)),t}setXY(e,t,i){return e=e*this.data.stride+this.offset,this.normalized&&(t=st(t,this.array),i=st(i,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=i,this}setXYZ(e,t,i,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=st(t,this.array),i=st(i,this.array),r=st(r,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=i,this.data.array[e+2]=r,this}setXYZW(e,t,i,r,s){return e=e*this.data.stride+this.offset,this.normalized&&(t=st(t,this.array),i=st(i,this.array),r=st(r,this.array),s=st(s,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=i,this.data.array[e+2]=r,this.data.array[e+3]=s,this}clone(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let i=0;i<this.count;i++){let r=i*this.data.stride+this.offset;for(let s=0;s<this.itemSize;s++)t.push(this.data.array[r+s])}return new St(new this.array.constructor(t),this.itemSize,this.normalized)}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.clone(e)),new n(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let i=0;i<this.count;i++){let r=i*this.data.stride+this.offset;for(let s=0;s<this.itemSize;s++)t.push(this.data.array[r+s])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}};var oa=class extends Qt{constructor(e=null,t=1,i=1,r,s,a,o,l,c=Vt,h=Vt,u,f){super(null,a,o,l,c,h,r,s,u,f),this.isDataTexture=!0,this.image={data:e,width:t,height:i},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var Nh=new N,b0=new N,_0=new ze,wn=class{constructor(e=new N(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,i,r){return this.normal.set(e,t,i),this.constant=r,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,i){let r=Nh.subVectors(i,t).cross(b0.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(r,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){let i=e.delta(Nh),r=this.normal.dot(i);if(r===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let s=-(e.start.dot(this.normal)+this.constant)/r;return s<0||s>1?null:t.copy(e.start).addScaledVector(i,s)}intersectsLine(e){let t=this.distanceToPoint(e.start),i=this.distanceToPoint(e.end);return t<0&&i>0||i<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let i=t||_0.getNormalMatrix(e),r=this.coplanarPoint(Nh).applyMatrix4(e),s=this.normal.applyMatrix3(i).normalize();return this.constant=-r.dot(s),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}},ar=new Li,S0=new Le(.5,.5),Io=new N,la=class{constructor(e=new wn,t=new wn,i=new wn,r=new wn,s=new wn,a=new wn){this.planes=[e,t,i,r,s,a]}set(e,t,i,r,s,a){let o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(i),o[3].copy(r),o[4].copy(s),o[5].copy(a),this}copy(e){let t=this.planes;for(let i=0;i<6;i++)t[i].copy(e.planes[i]);return this}setFromProjectionMatrix(e,t=kn,i=!1){let r=this.planes,s=e.elements,a=s[0],o=s[1],l=s[2],c=s[3],h=s[4],u=s[5],f=s[6],d=s[7],g=s[8],y=s[9],m=s[10],p=s[11],b=s[12],_=s[13],v=s[14],E=s[15];if(r[0].setComponents(c-a,d-h,p-g,E-b).normalize(),r[1].setComponents(c+a,d+h,p+g,E+b).normalize(),r[2].setComponents(c+o,d+u,p+y,E+_).normalize(),r[3].setComponents(c-o,d-u,p-y,E-_).normalize(),i)r[4].setComponents(l,f,m,v).normalize(),r[5].setComponents(c-l,d-f,p-m,E-v).normalize();else if(r[4].setComponents(c-l,d-f,p-m,E-v).normalize(),t===kn)r[5].setComponents(c+l,d+f,p+m,E+v).normalize();else if(t===Ks)r[5].setComponents(l,f,m,v).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),ar.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),ar.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(ar)}intersectsSprite(e){ar.center.set(0,0,0);let t=S0.distanceTo(e.center);return ar.radius=.7071067811865476+t,ar.applyMatrix4(e.matrixWorld),this.intersectsSphere(ar)}intersectsSphere(e){let t=this.planes,i=e.center,r=-e.radius;for(let s=0;s<6;s++)if(t[s].distanceToPoint(i)<r)return!1;return!0}intersectsBox(e){let t=this.planes;for(let i=0;i<6;i++){let r=t[i];if(Io.x=r.normal.x>0?e.max.x:e.min.x,Io.y=r.normal.y>0?e.max.y:e.min.y,Io.z=r.normal.z>0?e.max.z:e.min.z,r.distanceToPoint(Io)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let i=0;i<6;i++)if(t[i].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};var ur=class extends di{constructor(e){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new Je(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}},Jo=new N,Zo=new N,Mf=new bt,qs=new Di,Lo=new Li,Oh=new N,Ef=new N,is=class extends Ht{constructor(e=new wt,t=new ur){super(),this.isLine=!0,this.type="Line",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,i=[0];for(let r=1,s=t.count;r<s;r++)Jo.fromBufferAttribute(t,r-1),Zo.fromBufferAttribute(t,r),i[r]=i[r-1],i[r]+=Jo.distanceTo(Zo);e.setAttribute("lineDistance",new Xt(i,1))}else console.warn("THREE.Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}raycast(e,t){let i=this.geometry,r=this.matrixWorld,s=e.params.Line.threshold,a=i.drawRange;if(i.boundingSphere===null&&i.computeBoundingSphere(),Lo.copy(i.boundingSphere),Lo.applyMatrix4(r),Lo.radius+=s,e.ray.intersectsSphere(Lo)===!1)return;Mf.copy(r).invert(),qs.copy(e.ray).applyMatrix4(Mf);let o=s/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=this.isLineSegments?2:1,h=i.index,f=i.attributes.position;if(h!==null){let d=Math.max(0,a.start),g=Math.min(h.count,a.start+a.count);for(let y=d,m=g-1;y<m;y+=c){let p=h.getX(y),b=h.getX(y+1),_=Do(this,e,qs,l,p,b,y);_&&t.push(_)}if(this.isLineLoop){let y=h.getX(g-1),m=h.getX(d),p=Do(this,e,qs,l,y,m,g-1);p&&t.push(p)}}else{let d=Math.max(0,a.start),g=Math.min(f.count,a.start+a.count);for(let y=d,m=g-1;y<m;y+=c){let p=Do(this,e,qs,l,y,y+1,y);p&&t.push(p)}if(this.isLineLoop){let y=Do(this,e,qs,l,g-1,d,g-1);y&&t.push(y)}}}updateMorphTargets(){let t=this.geometry.morphAttributes,i=Object.keys(t);if(i.length>0){let r=t[i[0]];if(r!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let s=0,a=r.length;s<a;s++){let o=r[s].name||String(s);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=s}}}}};function Do(n,e,t,i,r,s,a){let o=n.geometry.attributes.position;if(Jo.fromBufferAttribute(o,r),Zo.fromBufferAttribute(o,s),t.distanceSqToSegment(Jo,Zo,Oh,Ef)>i)return;Oh.applyMatrix4(n.matrixWorld);let c=e.ray.origin.distanceTo(Oh);if(!(c<e.near||c>e.far))return{distance:c,point:Ef.clone().applyMatrix4(n.matrixWorld),index:a,face:null,faceIndex:null,barycoord:null,object:n}}var Tf=new N,Af=new N,rs=class extends is{constructor(e,t){super(e,t),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,i=[];for(let r=0,s=t.count;r<s;r+=2)Tf.fromBufferAttribute(t,r),Af.fromBufferAttribute(t,r+1),i[r]=r===0?0:i[r-1],i[r+1]=i[r]+Tf.distanceTo(Af);e.setAttribute("lineDistance",new Xt(i,1))}else console.warn("THREE.LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}};var dr=class extends di{constructor(e){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new Je(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},Cf=new bt,Vh=new Di,ko=new Li,No=new N,ss=class extends Ht{constructor(e=new wt,t=new dr){super(),this.isPoints=!0,this.type="Points",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}raycast(e,t){let i=this.geometry,r=this.matrixWorld,s=e.params.Points.threshold,a=i.drawRange;if(i.boundingSphere===null&&i.computeBoundingSphere(),ko.copy(i.boundingSphere),ko.applyMatrix4(r),ko.radius+=s,e.ray.intersectsSphere(ko)===!1)return;Cf.copy(r).invert(),Vh.copy(e.ray).applyMatrix4(Cf);let o=s/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=i.index,u=i.attributes.position;if(c!==null){let f=Math.max(0,a.start),d=Math.min(c.count,a.start+a.count);for(let g=f,y=d;g<y;g++){let m=c.getX(g);No.fromBufferAttribute(u,m),Rf(No,m,l,r,e,t,this)}}else{let f=Math.max(0,a.start),d=Math.min(u.count,a.start+a.count);for(let g=f,y=d;g<y;g++)No.fromBufferAttribute(u,g),Rf(No,g,l,r,e,t,this)}}updateMorphTargets(){let t=this.geometry.morphAttributes,i=Object.keys(t);if(i.length>0){let r=t[i[0]];if(r!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let s=0,a=r.length;s<a;s++){let o=r[s].name||String(s);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=s}}}}};function Rf(n,e,t,i,r,s,a){let o=Vh.distanceSqToPoint(n);if(o<t){let l=new N;Vh.closestPointToPoint(n,l),l.applyMatrix4(i);let c=r.ray.origin.distanceTo(l);if(c<r.near||c>r.far)return;s.push({distance:c,distanceToRay:Math.sqrt(o),point:l,index:e,face:null,faceIndex:null,barycoord:null,object:a})}}var ca=class extends Qt{constructor(e,t,i,r,s,a,o,l,c){super(e,t,i,r,s,a,o,l,c),this.isCanvasTexture=!0,this.needsUpdate=!0}},ha=class extends Qt{constructor(e,t,i=Fi,r,s,a,o=Vt,l=Vt,c,h=Zr,u=1){if(h!==Zr&&h!==us)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");let f={width:e,height:t,depth:u};super(f,r,s,a,o,l,h,i,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new es(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}},ua=class extends Qt{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}};var fr=class n extends wt{constructor(e=1,t=1,i=1,r=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:i,heightSegments:r};let s=e/2,a=t/2,o=Math.floor(i),l=Math.floor(r),c=o+1,h=l+1,u=e/o,f=t/l,d=[],g=[],y=[],m=[];for(let p=0;p<h;p++){let b=p*f-a;for(let _=0;_<c;_++){let v=_*u-s;g.push(v,-b,0),y.push(0,0,1),m.push(_/o),m.push(1-p/l)}}for(let p=0;p<l;p++)for(let b=0;b<o;b++){let _=b+c*p,v=b+c*(p+1),E=b+1+c*(p+1),A=b+1+c*p;d.push(_,v,A),d.push(v,E,A)}this.setIndex(d),this.setAttribute("position",new Xt(g,3)),this.setAttribute("normal",new Xt(y,3)),this.setAttribute("uv",new Xt(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new n(e.width,e.height,e.widthSegments,e.heightSegments)}};var Ko=class extends di{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=lp,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}},Qo=class extends di{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}};function Oo(n,e){return!n||n.constructor===e?n:typeof e.BYTES_PER_ELEMENT=="number"?new e(n):Array.prototype.slice.call(n)}function w0(n){return ArrayBuffer.isView(n)&&!(n instanceof DataView)}var pr=class{constructor(e,t,i,r){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=r!==void 0?r:new t.constructor(i),this.sampleValues=t,this.valueSize=i,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,i=this._cachedIndex,r=t[i],s=t[i-1];n:{e:{let a;t:{i:if(!(e<r)){for(let o=i+2;;){if(r===void 0){if(e<s)break i;return i=t.length,this._cachedIndex=i,this.copySampleValue_(i-1)}if(i===o)break;if(s=r,r=t[++i],e<r)break e}a=t.length;break t}if(!(e>=s)){let o=t[1];e<o&&(i=2,s=o);for(let l=i-2;;){if(s===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===l)break;if(r=s,s=t[--i-1],e>=s)break e}a=i,i=0;break t}break n}for(;i<a;){let o=i+a>>>1;e<t[o]?a=o:i=o+1}if(r=t[i],s=t[i-1],s===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(r===void 0)return i=t.length,this._cachedIndex=i,this.copySampleValue_(i-1)}this._cachedIndex=i,this.intervalChanged_(i,s,r)}return this.interpolate_(i,s,e,r)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,i=this.sampleValues,r=this.valueSize,s=e*r;for(let a=0;a!==r;++a)t[a]=i[s+a];return t}interpolate_(){throw new Error("call to abstract method")}intervalChanged_(){}},el=class extends pr{constructor(e,t,i,r){super(e,t,i,r),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:Uh,endingEnd:Uh}}intervalChanged_(e,t,i){let r=this.parameterPositions,s=e-2,a=e+1,o=r[s],l=r[a];if(o===void 0)switch(this.getSettings_().endingStart){case Fh:s=e,o=2*t-i;break;case Bh:s=r.length-2,o=t+r[s]-r[s+1];break;default:s=e,o=i}if(l===void 0)switch(this.getSettings_().endingEnd){case Fh:a=e,l=2*i-t;break;case Bh:a=1,l=i+r[1]-r[0];break;default:a=e-1,l=t}let c=(i-t)*.5,h=this.valueSize;this._weightPrev=c/(t-o),this._weightNext=c/(l-i),this._offsetPrev=s*h,this._offsetNext=a*h}interpolate_(e,t,i,r){let s=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=e*o,c=l-o,h=this._offsetPrev,u=this._offsetNext,f=this._weightPrev,d=this._weightNext,g=(i-t)/(r-t),y=g*g,m=y*g,p=-f*m+2*f*y-f*g,b=(1+f)*m+(-1.5-2*f)*y+(-.5+f)*g+1,_=(-1-d)*m+(1.5+d)*y+.5*g,v=d*m-d*y;for(let E=0;E!==o;++E)s[E]=p*a[h+E]+b*a[c+E]+_*a[l+E]+v*a[u+E];return s}},tl=class extends pr{constructor(e,t,i,r){super(e,t,i,r)}interpolate_(e,t,i,r){let s=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=e*o,c=l-o,h=(i-t)/(r-t),u=1-h;for(let f=0;f!==o;++f)s[f]=a[c+f]*u+a[l+f]*h;return s}},nl=class extends pr{constructor(e,t,i,r){super(e,t,i,r)}interpolate_(e){return this.copySampleValue_(e-1)}},yn=class{constructor(e,t,i,r){if(e===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=Oo(t,this.TimeBufferType),this.values=Oo(i,this.ValueBufferType),this.setInterpolation(r||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,i;if(t.toJSON!==this.toJSON)i=t.toJSON(e);else{i={name:e.name,times:Oo(e.times,Array),values:Oo(e.values,Array)};let r=e.getInterpolation();r!==e.DefaultInterpolation&&(i.interpolation=r)}return i.type=e.ValueTypeName,i}InterpolantFactoryMethodDiscrete(e){return new nl(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new tl(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new el(this.times,this.values,this.getValueSize(),e)}setInterpolation(e){let t;switch(e){case Js:t=this.InterpolantFactoryMethodDiscrete;break;case Ho:t=this.InterpolantFactoryMethodLinear;break;case Uo:t=this.InterpolantFactoryMethodSmooth;break}if(t===void 0){let i="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(i);return console.warn("THREE.KeyframeTrack:",i),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return Js;case this.InterpolantFactoryMethodLinear:return Ho;case this.InterpolantFactoryMethodSmooth:return Uo}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let i=0,r=t.length;i!==r;++i)t[i]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let i=0,r=t.length;i!==r;++i)t[i]*=e}return this}trim(e,t){let i=this.times,r=i.length,s=0,a=r-1;for(;s!==r&&i[s]<e;)++s;for(;a!==-1&&i[a]>t;)--a;if(++a,s!==0||a!==r){s>=a&&(a=Math.max(a,1),s=a-1);let o=this.getValueSize();this.times=i.slice(s,a),this.values=this.values.slice(s*o,a*o)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(console.error("THREE.KeyframeTrack: Invalid value size in track.",this),e=!1);let i=this.times,r=this.values,s=i.length;s===0&&(console.error("THREE.KeyframeTrack: Track is empty.",this),e=!1);let a=null;for(let o=0;o!==s;o++){let l=i[o];if(typeof l=="number"&&isNaN(l)){console.error("THREE.KeyframeTrack: Time is not a valid number.",this,o,l),e=!1;break}if(a!==null&&a>l){console.error("THREE.KeyframeTrack: Out of order keys.",this,o,l,a),e=!1;break}a=l}if(r!==void 0&&w0(r))for(let o=0,l=r.length;o!==l;++o){let c=r[o];if(isNaN(c)){console.error("THREE.KeyframeTrack: Value is not a valid number.",this,o,c),e=!1;break}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),i=this.getValueSize(),r=this.getInterpolation()===Uo,s=e.length-1,a=1;for(let o=1;o<s;++o){let l=!1,c=e[o],h=e[o+1];if(c!==h&&(o!==1||c!==e[0]))if(r)l=!0;else{let u=o*i,f=u-i,d=u+i;for(let g=0;g!==i;++g){let y=t[u+g];if(y!==t[f+g]||y!==t[d+g]){l=!0;break}}}if(l){if(o!==a){e[a]=e[o];let u=o*i,f=a*i;for(let d=0;d!==i;++d)t[f+d]=t[u+d]}++a}}if(s>0){e[a]=e[s];for(let o=s*i,l=a*i,c=0;c!==i;++c)t[l+c]=t[o+c];++a}return a!==e.length?(this.times=e.slice(0,a),this.values=t.slice(0,a*i)):(this.times=e,this.values=t),this}clone(){let e=this.times.slice(),t=this.values.slice(),i=this.constructor,r=new i(this.name,e,t);return r.createInterpolant=this.createInterpolant,r}};yn.prototype.ValueTypeName="";yn.prototype.TimeBufferType=Float32Array;yn.prototype.ValueBufferType=Float32Array;yn.prototype.DefaultInterpolation=Ho;var ki=class extends yn{constructor(e,t,i){super(e,t,i)}};ki.prototype.ValueTypeName="bool";ki.prototype.ValueBufferType=Array;ki.prototype.DefaultInterpolation=Js;ki.prototype.InterpolantFactoryMethodLinear=void 0;ki.prototype.InterpolantFactoryMethodSmooth=void 0;var il=class extends yn{constructor(e,t,i,r){super(e,t,i,r)}};il.prototype.ValueTypeName="color";var rl=class extends yn{constructor(e,t,i,r){super(e,t,i,r)}};rl.prototype.ValueTypeName="number";var sl=class extends pr{constructor(e,t,i,r){super(e,t,i,r)}interpolate_(e,t,i,r){let s=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=(i-t)/(r-t),c=e*o;for(let h=c+o;c!==h;c+=4)Mn.slerpFlat(s,0,a,c-o,a,c,l);return s}},da=class extends yn{constructor(e,t,i,r){super(e,t,i,r)}InterpolantFactoryMethodLinear(e){return new sl(this.times,this.values,this.getValueSize(),e)}};da.prototype.ValueTypeName="quaternion";da.prototype.InterpolantFactoryMethodSmooth=void 0;var Ni=class extends yn{constructor(e,t,i){super(e,t,i)}};Ni.prototype.ValueTypeName="string";Ni.prototype.ValueBufferType=Array;Ni.prototype.DefaultInterpolation=Js;Ni.prototype.InterpolantFactoryMethodLinear=void 0;Ni.prototype.InterpolantFactoryMethodSmooth=void 0;var al=class extends yn{constructor(e,t,i,r){super(e,t,i,r)}};al.prototype.ValueTypeName="vector";var ol=class{constructor(e,t,i){let r=this,s=!1,a=0,o=0,l,c=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=i,this.abortController=new AbortController,this.itemStart=function(h){o++,s===!1&&r.onStart!==void 0&&r.onStart(h,a,o),s=!0},this.itemEnd=function(h){a++,r.onProgress!==void 0&&r.onProgress(h,a,o),a===o&&(s=!1,r.onLoad!==void 0&&r.onLoad())},this.itemError=function(h){r.onError!==void 0&&r.onError(h)},this.resolveURL=function(h){return l?l(h):h},this.setURLModifier=function(h){return l=h,this},this.addHandler=function(h,u){return c.push(h,u),this},this.removeHandler=function(h){let u=c.indexOf(h);return u!==-1&&c.splice(u,2),this},this.getHandler=function(h){for(let u=0,f=c.length;u<f;u+=2){let d=c[u],g=c[u+1];if(d.global&&(d.lastIndex=0),d.test(h))return g}return null},this.abort=function(){return this.abortController.abort(),this.abortController=new AbortController,this}}},wp=new ol,ll=class{constructor(e){this.manager=e!==void 0?e:wp,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={}}load(){}loadAsync(e,t){let i=this;return new Promise(function(r,s){i.load(e,r,t,s)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}abort(){return this}};ll.DEFAULT_MATERIAL_NAME="__DEFAULT";var Un=class extends sa{constructor(e=-1,t=1,i=1,r=-1,s=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=i,this.bottom=r,this.near=s,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,i,r,s,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=r,this.view.width=s,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),i=(this.right+this.left)/2,r=(this.top+this.bottom)/2,s=i-e,a=i+e,o=r+t,l=r-t;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;s+=c*this.view.offsetX,a=s+c*this.view.width,o-=h*this.view.offsetY,l=o-h*this.view.height}this.projectionMatrix.makeOrthographic(s,a,o,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}};var as=class extends wt{constructor(){super(),this.isInstancedBufferGeometry=!0,this.type="InstancedBufferGeometry",this.instanceCount=1/0}copy(e){return super.copy(e),this.instanceCount=e.instanceCount,this}toJSON(){let e=super.toJSON();return e.instanceCount=this.instanceCount,e.isInstancedBufferGeometry=!0,e}};var cl=class extends $t{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}};var cu="\\[\\]\\.:\\/",M0=new RegExp("["+cu+"]","g"),hu="[^"+cu+"]",E0="[^"+cu.replace("\\.","")+"]",T0=/((?:WC+[\/:])*)/.source.replace("WC",hu),A0=/(WCOD+)?/.source.replace("WCOD",E0),C0=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",hu),R0=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",hu),P0=new RegExp("^"+T0+A0+C0+R0+"$"),I0=["material","materials","bones","map"],Hh=class{constructor(e,t,i){let r=i||gt.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,r)}getValue(e,t){this.bind();let i=this._targetGroup.nCachedObjects_,r=this._bindings[i];r!==void 0&&r.getValue(e,t)}setValue(e,t){let i=this._bindings;for(let r=this._targetGroup.nCachedObjects_,s=i.length;r!==s;++r)i[r].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,i=e.length;t!==i;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,i=e.length;t!==i;++t)e[t].unbind()}},gt=class n{constructor(e,t,i){this.path=t,this.parsedPath=i||n.parseTrackName(t),this.node=n.findNode(e,this.parsedPath.nodeName),this.rootNode=e,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(e,t,i){return e&&e.isAnimationObjectGroup?new n.Composite(e,t,i):new n(e,t,i)}static sanitizeNodeName(e){return e.replace(/\s/g,"_").replace(M0,"")}static parseTrackName(e){let t=P0.exec(e);if(t===null)throw new Error("PropertyBinding: Cannot parse trackName: "+e);let i={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},r=i.nodeName&&i.nodeName.lastIndexOf(".");if(r!==void 0&&r!==-1){let s=i.nodeName.substring(r+1);I0.indexOf(s)!==-1&&(i.nodeName=i.nodeName.substring(0,r),i.objectName=s)}if(i.propertyName===null||i.propertyName.length===0)throw new Error("PropertyBinding: can not parse propertyName from trackName: "+e);return i}static findNode(e,t){if(t===void 0||t===""||t==="."||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let i=e.skeleton.getBoneByName(t);if(i!==void 0)return i}if(e.children){let i=function(s){for(let a=0;a<s.length;a++){let o=s[a];if(o.name===t||o.uuid===t)return o;let l=i(o.children);if(l)return l}return null},r=i(e.children);if(r)return r}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let i=this.resolvedProperty;for(let r=0,s=i.length;r!==s;++r)e[t++]=i[r]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let i=this.resolvedProperty;for(let r=0,s=i.length;r!==s;++r)i[r]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let i=this.resolvedProperty;for(let r=0,s=i.length;r!==s;++r)i[r]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let i=this.resolvedProperty;for(let r=0,s=i.length;r!==s;++r)i[r]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let e=this.node,t=this.parsedPath,i=t.objectName,r=t.propertyName,s=t.propertyIndex;if(e||(e=n.findNode(this.rootNode,t.nodeName),this.node=e),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!e){console.warn("THREE.PropertyBinding: No target node found for track: "+this.path+".");return}if(i){let c=t.objectIndex;switch(i){case"materials":if(!e.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.materials){console.error("THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}e=e.material.materials;break;case"bones":if(!e.skeleton){console.error("THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}e=e.skeleton.bones;for(let h=0;h<e.length;h++)if(e[h].name===c){c=h;break}break;case"map":if("map"in e){e=e.map;break}if(!e.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.map){console.error("THREE.PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}e=e.material.map;break;default:if(e[i]===void 0){console.error("THREE.PropertyBinding: Can not bind to objectName of node undefined.",this);return}e=e[i]}if(c!==void 0){if(e[c]===void 0){console.error("THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,e);return}e=e[c]}}let a=e[r];if(a===void 0){let c=t.nodeName;console.error("THREE.PropertyBinding: Trying to update property for track: "+c+"."+r+" but it wasn't found.",e);return}let o=this.Versioning.None;this.targetObject=e,e.isMaterial===!0?o=this.Versioning.NeedsUpdate:e.isObject3D===!0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(s!==void 0){if(r==="morphTargetInfluences"){if(!e.geometry){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!e.geometry.morphAttributes){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}e.morphTargetDictionary[s]!==void 0&&(s=e.morphTargetDictionary[s])}l=this.BindingType.ArrayElement,this.resolvedProperty=a,this.propertyIndex=s}else a.fromArray!==void 0&&a.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=a):Array.isArray(a)?(l=this.BindingType.EntireArray,this.resolvedProperty=a):this.propertyName=r;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};gt.Composite=Hh;gt.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};gt.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};gt.prototype.GetterByBindingType=[gt.prototype._getValue_direct,gt.prototype._getValue_array,gt.prototype._getValue_arrayElement,gt.prototype._getValue_toArray];gt.prototype.SetterByBindingTypeAndVersioning=[[gt.prototype._setValue_direct,gt.prototype._setValue_direct_setNeedsUpdate,gt.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[gt.prototype._setValue_array,gt.prototype._setValue_array_setNeedsUpdate,gt.prototype._setValue_array_setMatrixWorldNeedsUpdate],[gt.prototype._setValue_arrayElement,gt.prototype._setValue_arrayElement_setNeedsUpdate,gt.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[gt.prototype._setValue_fromArray,gt.prototype._setValue_fromArray_setNeedsUpdate,gt.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var CM=new Float32Array(1);var Oi=class extends jo{constructor(e,t,i=1){super(e,t),this.isInstancedInterleavedBuffer=!0,this.meshPerAttribute=i}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}clone(e){let t=super.clone(e);return t.meshPerAttribute=this.meshPerAttribute,t}toJSON(e){let t=super.toJSON(e);return t.isInstancedInterleavedBuffer=!0,t.meshPerAttribute=this.meshPerAttribute,t}};var os=class{constructor(e=1,t=0,i=0){this.radius=e,this.phi=t,this.theta=i}set(e,t,i){return this.radius=e,this.phi=t,this.theta=i,this}copy(e){return this.radius=e.radius,this.phi=e.phi,this.theta=e.theta,this}makeSafe(){return this.phi=Xe(this.phi,1e-6,Math.PI-1e-6),this}setFromVector3(e){return this.setFromCartesianCoords(e.x,e.y,e.z)}setFromCartesianCoords(e,t,i){return this.radius=Math.sqrt(e*e+t*t+i*i),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(e,i),this.phi=Math.acos(Xe(t/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}};var Pf=new Le,fa=class{constructor(e=new Le(1/0,1/0),t=new Le(-1/0,-1/0)){this.isBox2=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromPoints(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let i=Pf.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(i),this.max.copy(e).add(i),this}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=1/0,this.max.x=this.max.y=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y}getCenter(e){return this.isEmpty()?e.set(0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Pf).distanceTo(e)}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}};var pa=class extends Xn{constructor(e,t=null){super(),this.object=e,this.domElement=t,this.enabled=!0,this.state=-1,this.keys={},this.mouseButtons={LEFT:null,MIDDLE:null,RIGHT:null},this.touches={ONE:null,TWO:null}}connect(e){if(e===void 0){console.warn("THREE.Controls: connect() now requires an element.");return}this.domElement!==null&&this.disconnect(),this.domElement=e}disconnect(){}dispose(){}update(){}};function uu(n,e,t,i){let r=L0(i);switch(t){case eu:return n*e;case nu:return n*e/r.components*r.byteLength;case wl:return n*e/r.components*r.byteLength;case iu:return n*e*2/r.components*r.byteLength;case Ml:return n*e*2/r.components*r.byteLength;case tu:return n*e*3/r.components*r.byteLength;case on:return n*e*4/r.components*r.byteLength;case El:return n*e*4/r.components*r.byteLength;case ya:case va:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*8;case xa:case ba:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*16;case Al:case Rl:return Math.max(n,16)*Math.max(e,8)/4;case Tl:case Cl:return Math.max(n,8)*Math.max(e,8)/2;case Pl:case Il:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*8;case Ll:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*16;case Dl:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*16;case kl:return Math.floor((n+4)/5)*Math.floor((e+3)/4)*16;case Nl:return Math.floor((n+4)/5)*Math.floor((e+4)/5)*16;case Ol:return Math.floor((n+5)/6)*Math.floor((e+4)/5)*16;case Ul:return Math.floor((n+5)/6)*Math.floor((e+5)/6)*16;case Fl:return Math.floor((n+7)/8)*Math.floor((e+4)/5)*16;case Bl:return Math.floor((n+7)/8)*Math.floor((e+5)/6)*16;case zl:return Math.floor((n+7)/8)*Math.floor((e+7)/8)*16;case Vl:return Math.floor((n+9)/10)*Math.floor((e+4)/5)*16;case Hl:return Math.floor((n+9)/10)*Math.floor((e+5)/6)*16;case Gl:return Math.floor((n+9)/10)*Math.floor((e+7)/8)*16;case Wl:return Math.floor((n+9)/10)*Math.floor((e+9)/10)*16;case $l:return Math.floor((n+11)/12)*Math.floor((e+9)/10)*16;case Xl:return Math.floor((n+11)/12)*Math.floor((e+11)/12)*16;case ql:case Yl:case jl:return Math.ceil(n/4)*Math.ceil(e/4)*16;case Jl:case Zl:return Math.ceil(n/4)*Math.ceil(e/4)*8;case Kl:case Ql:return Math.ceil(n/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function L0(n){switch(n){case jn:case Jh:return{byteLength:1,components:1};case ls:case Zh:case cs:return{byteLength:2,components:1};case _l:case Sl:return{byteLength:2,components:4};case Fi:case bl:case Cn:return{byteLength:4,components:1};case Kh:case Qh:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${n}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"180"}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="180");function qp(){let n=null,e=!1,t=null,i=null;function r(s,a){t(s,a),i=n.requestAnimationFrame(r)}return{start:function(){e!==!0&&t!==null&&(i=n.requestAnimationFrame(r),e=!0)},stop:function(){n.cancelAnimationFrame(i),e=!1},setAnimationLoop:function(s){t=s},setContext:function(s){n=s}}}function k0(n){let e=new WeakMap;function t(o,l){let c=o.array,h=o.usage,u=c.byteLength,f=n.createBuffer();n.bindBuffer(l,f),n.bufferData(l,c,h),o.onUploadCallback();let d;if(c instanceof Float32Array)d=n.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)d=n.HALF_FLOAT;else if(c instanceof Uint16Array)o.isFloat16BufferAttribute?d=n.HALF_FLOAT:d=n.UNSIGNED_SHORT;else if(c instanceof Int16Array)d=n.SHORT;else if(c instanceof Uint32Array)d=n.UNSIGNED_INT;else if(c instanceof Int32Array)d=n.INT;else if(c instanceof Int8Array)d=n.BYTE;else if(c instanceof Uint8Array)d=n.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)d=n.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:f,type:d,bytesPerElement:c.BYTES_PER_ELEMENT,version:o.version,size:u}}function i(o,l,c){let h=l.array,u=l.updateRanges;if(n.bindBuffer(c,o),u.length===0)n.bufferSubData(c,0,h);else{u.sort((d,g)=>d.start-g.start);let f=0;for(let d=1;d<u.length;d++){let g=u[f],y=u[d];y.start<=g.start+g.count+1?g.count=Math.max(g.count,y.start+y.count-g.start):(++f,u[f]=y)}u.length=f+1;for(let d=0,g=u.length;d<g;d++){let y=u[d];n.bufferSubData(c,y.start*h.BYTES_PER_ELEMENT,h,y.start,y.count)}l.clearUpdateRanges()}l.onUploadCallback()}function r(o){return o.isInterleavedBufferAttribute&&(o=o.data),e.get(o)}function s(o){o.isInterleavedBufferAttribute&&(o=o.data);let l=e.get(o);l&&(n.deleteBuffer(l.buffer),e.delete(o))}function a(o,l){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){let h=e.get(o);(!h||h.version<o.version)&&e.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}let c=e.get(o);if(c===void 0)e.set(o,t(o,l));else if(c.version<o.version){if(c.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");i(c.buffer,o,l),c.version=o.version}}return{get:r,remove:s,update:a}}var N0=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,O0=`#ifdef USE_ALPHAHASH
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
#endif`,U0=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,F0=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,B0=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,z0=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,V0=`#ifdef USE_AOMAP
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
#endif`,H0=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,G0=`#ifdef USE_BATCHING
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
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,W0=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,$0=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,X0=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,q0=`float G_BlinnPhong_Implicit( ) {
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
} // validated`,Y0=`#ifdef USE_IRIDESCENCE
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
#endif`,j0=`#ifdef USE_BUMPMAP
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
#endif`,J0=`#if NUM_CLIPPING_PLANES > 0
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
#endif`,Z0=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,K0=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,Q0=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,ev=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,tv=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,nv=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,iv=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,rv=`#define PI 3.141592653589793
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
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
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
} // validated`,sv=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,av=`vec3 transformedNormal = objectNormal;
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
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,ov=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,lv=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,cv=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,hv=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,uv="gl_FragColor = linearToOutputTexel( gl_FragColor );",dv=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,fv=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,pv=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,mv=`#ifdef USE_ENVMAP
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
#endif`,gv=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,yv=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,vv=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,xv=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,bv=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,_v=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Sv=`#ifdef USE_GRADIENTMAP
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
}`,wv=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Mv=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,Ev=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Tv=`uniform bool receiveShadow;
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
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
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
#endif`,Av=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,Cv=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Rv=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Pv=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Iv=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Lv=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
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
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
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
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
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
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
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
#endif`,Dv=`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
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
		vec3 iridescenceF0;
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
		float v = 0.5 / ( gv + gl );
		return saturate(v);
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
		float roughness = material.clearcoatRoughness;
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
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
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
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
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
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
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
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
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
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
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
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,kv=`
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
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
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
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
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
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,Nv=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,Ov=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Uv=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,Fv=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Bv=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,zv=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,Vv=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,Hv=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,Gv=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
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
#endif`,Wv=`#if defined( USE_POINTS_UV )
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
#endif`,$v=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,Xv=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,qv=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,Yv=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,jv=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Jv=`#ifdef USE_MORPHTARGETS
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
#endif`,Zv=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Kv=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
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
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
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
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,Qv=`#ifdef USE_NORMALMAP_OBJECTSPACE
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
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,ex=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,tx=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,nx=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,ix=`#ifdef USE_NORMALMAP
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
#endif`,rx=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,sx=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,ax=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,ox=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,lx=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,cx=`vec3 packNormalToRGB( const in vec3 normal ) {
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
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,hx=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,ux=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,dx=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,fx=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,px=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,mx=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,gx=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
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
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
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
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
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
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		float depth = unpackRGBAToDepth( texture2D( depths, uv ) );
		#ifdef USE_REVERSED_DEPTH_BUFFER
			return step( depth, compare );
		#else
			return step( compare, depth );
		#endif
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow( sampler2D shadow, vec2 uv, float compare ) {
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		#ifdef USE_REVERSED_DEPTH_BUFFER
			float hard_shadow = step( distribution.x, compare );
		#else
			float hard_shadow = step( compare, distribution.x );
		#endif
		if ( hard_shadow != 1.0 ) {
			float distance = compare - distribution.x;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
#endif`,yx=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
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
#endif`,vx=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
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
#endif`,xx=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
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
	#if NUM_POINT_LIGHT_SHADOWS > 0
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
}`,bx=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,_x=`#ifdef USE_SKINNING
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
#endif`,Sx=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,wx=`#ifdef USE_SKINNING
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
#endif`,Mx=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,Ex=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,Tx=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Ax=`#ifndef saturate
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
vec3 CustomToneMapping( vec3 color ) { return color; }`,Cx=`#ifdef USE_TRANSMISSION
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
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,Rx=`#ifdef USE_TRANSMISSION
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
#endif`,Px=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Ix=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Lx=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Dx=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,kx=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,Nx=`uniform sampler2D t2D;
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
}`,Ox=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Ux=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Fx=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Bx=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,zx=`#include <common>
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
}`,Vx=`#if DEPTH_PACKING == 3200
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
}`,Hx=`#define DISTANCE
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
}`,Gx=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,Wx=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,$x=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Xx=`uniform float scale;
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
}`,qx=`uniform vec3 diffuse;
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
}`,Yx=`#include <common>
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
}`,jx=`uniform vec3 diffuse;
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
}`,Jx=`#define LAMBERT
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
}`,Zx=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
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
}`,Kx=`#define MATCAP
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
}`,Qx=`#define MATCAP
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
}`,eb=`#define NORMAL
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
}`,tb=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
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
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,nb=`#define PHONG
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
}`,ib=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
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
}`,rb=`#define STANDARD
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
}`,sb=`#define STANDARD
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
#ifdef USE_DISPERSION
	uniform float dispersion;
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
#include <packing>
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
#include <cube_uv_reflection_fragment>
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
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
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
}`,ab=`#define TOON
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
}`,ob=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
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
}`,lb=`uniform float size;
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
}`,cb=`uniform vec3 diffuse;
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
}`,hb=`#include <common>
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
}`,ub=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
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
}`,db=`uniform float rotation;
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
}`,fb=`uniform vec3 diffuse;
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
}`,We={alphahash_fragment:N0,alphahash_pars_fragment:O0,alphamap_fragment:U0,alphamap_pars_fragment:F0,alphatest_fragment:B0,alphatest_pars_fragment:z0,aomap_fragment:V0,aomap_pars_fragment:H0,batching_pars_vertex:G0,batching_vertex:W0,begin_vertex:$0,beginnormal_vertex:X0,bsdfs:q0,iridescence_fragment:Y0,bumpmap_pars_fragment:j0,clipping_planes_fragment:J0,clipping_planes_pars_fragment:Z0,clipping_planes_pars_vertex:K0,clipping_planes_vertex:Q0,color_fragment:ev,color_pars_fragment:tv,color_pars_vertex:nv,color_vertex:iv,common:rv,cube_uv_reflection_fragment:sv,defaultnormal_vertex:av,displacementmap_pars_vertex:ov,displacementmap_vertex:lv,emissivemap_fragment:cv,emissivemap_pars_fragment:hv,colorspace_fragment:uv,colorspace_pars_fragment:dv,envmap_fragment:fv,envmap_common_pars_fragment:pv,envmap_pars_fragment:mv,envmap_pars_vertex:gv,envmap_physical_pars_fragment:Av,envmap_vertex:yv,fog_vertex:vv,fog_pars_vertex:xv,fog_fragment:bv,fog_pars_fragment:_v,gradientmap_pars_fragment:Sv,lightmap_pars_fragment:wv,lights_lambert_fragment:Mv,lights_lambert_pars_fragment:Ev,lights_pars_begin:Tv,lights_toon_fragment:Cv,lights_toon_pars_fragment:Rv,lights_phong_fragment:Pv,lights_phong_pars_fragment:Iv,lights_physical_fragment:Lv,lights_physical_pars_fragment:Dv,lights_fragment_begin:kv,lights_fragment_maps:Nv,lights_fragment_end:Ov,logdepthbuf_fragment:Uv,logdepthbuf_pars_fragment:Fv,logdepthbuf_pars_vertex:Bv,logdepthbuf_vertex:zv,map_fragment:Vv,map_pars_fragment:Hv,map_particle_fragment:Gv,map_particle_pars_fragment:Wv,metalnessmap_fragment:$v,metalnessmap_pars_fragment:Xv,morphinstance_vertex:qv,morphcolor_vertex:Yv,morphnormal_vertex:jv,morphtarget_pars_vertex:Jv,morphtarget_vertex:Zv,normal_fragment_begin:Kv,normal_fragment_maps:Qv,normal_pars_fragment:ex,normal_pars_vertex:tx,normal_vertex:nx,normalmap_pars_fragment:ix,clearcoat_normal_fragment_begin:rx,clearcoat_normal_fragment_maps:sx,clearcoat_pars_fragment:ax,iridescence_pars_fragment:ox,opaque_fragment:lx,packing:cx,premultiplied_alpha_fragment:hx,project_vertex:ux,dithering_fragment:dx,dithering_pars_fragment:fx,roughnessmap_fragment:px,roughnessmap_pars_fragment:mx,shadowmap_pars_fragment:gx,shadowmap_pars_vertex:yx,shadowmap_vertex:vx,shadowmask_pars_fragment:xx,skinbase_vertex:bx,skinning_pars_vertex:_x,skinning_vertex:Sx,skinnormal_vertex:wx,specularmap_fragment:Mx,specularmap_pars_fragment:Ex,tonemapping_fragment:Tx,tonemapping_pars_fragment:Ax,transmission_fragment:Cx,transmission_pars_fragment:Rx,uv_pars_fragment:Px,uv_pars_vertex:Ix,uv_vertex:Lx,worldpos_vertex:Dx,background_vert:kx,background_frag:Nx,backgroundCube_vert:Ox,backgroundCube_frag:Ux,cube_vert:Fx,cube_frag:Bx,depth_vert:zx,depth_frag:Vx,distanceRGBA_vert:Hx,distanceRGBA_frag:Gx,equirect_vert:Wx,equirect_frag:$x,linedashed_vert:Xx,linedashed_frag:qx,meshbasic_vert:Yx,meshbasic_frag:jx,meshlambert_vert:Jx,meshlambert_frag:Zx,meshmatcap_vert:Kx,meshmatcap_frag:Qx,meshnormal_vert:eb,meshnormal_frag:tb,meshphong_vert:nb,meshphong_frag:ib,meshphysical_vert:rb,meshphysical_frag:sb,meshtoon_vert:ab,meshtoon_frag:ob,points_vert:lb,points_frag:cb,shadow_vert:hb,shadow_frag:ub,sprite_vert:db,sprite_frag:fb},ce={common:{diffuse:{value:new Je(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new ze},alphaMap:{value:null},alphaMapTransform:{value:new ze},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new ze}},envmap:{envMap:{value:null},envMapRotation:{value:new ze},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new ze}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new ze}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new ze},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new ze},normalScale:{value:new Le(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new ze},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new ze}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new ze}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new ze}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Je(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new Je(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new ze},alphaTest:{value:0},uvTransform:{value:new ze}},sprite:{diffuse:{value:new Je(16777215)},opacity:{value:1},center:{value:new Le(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new ze},alphaMap:{value:null},alphaMapTransform:{value:new ze},alphaTest:{value:0}}},Jn={basic:{uniforms:jt([ce.common,ce.specularmap,ce.envmap,ce.aomap,ce.lightmap,ce.fog]),vertexShader:We.meshbasic_vert,fragmentShader:We.meshbasic_frag},lambert:{uniforms:jt([ce.common,ce.specularmap,ce.envmap,ce.aomap,ce.lightmap,ce.emissivemap,ce.bumpmap,ce.normalmap,ce.displacementmap,ce.fog,ce.lights,{emissive:{value:new Je(0)}}]),vertexShader:We.meshlambert_vert,fragmentShader:We.meshlambert_frag},phong:{uniforms:jt([ce.common,ce.specularmap,ce.envmap,ce.aomap,ce.lightmap,ce.emissivemap,ce.bumpmap,ce.normalmap,ce.displacementmap,ce.fog,ce.lights,{emissive:{value:new Je(0)},specular:{value:new Je(1118481)},shininess:{value:30}}]),vertexShader:We.meshphong_vert,fragmentShader:We.meshphong_frag},standard:{uniforms:jt([ce.common,ce.envmap,ce.aomap,ce.lightmap,ce.emissivemap,ce.bumpmap,ce.normalmap,ce.displacementmap,ce.roughnessmap,ce.metalnessmap,ce.fog,ce.lights,{emissive:{value:new Je(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:We.meshphysical_vert,fragmentShader:We.meshphysical_frag},toon:{uniforms:jt([ce.common,ce.aomap,ce.lightmap,ce.emissivemap,ce.bumpmap,ce.normalmap,ce.displacementmap,ce.gradientmap,ce.fog,ce.lights,{emissive:{value:new Je(0)}}]),vertexShader:We.meshtoon_vert,fragmentShader:We.meshtoon_frag},matcap:{uniforms:jt([ce.common,ce.bumpmap,ce.normalmap,ce.displacementmap,ce.fog,{matcap:{value:null}}]),vertexShader:We.meshmatcap_vert,fragmentShader:We.meshmatcap_frag},points:{uniforms:jt([ce.points,ce.fog]),vertexShader:We.points_vert,fragmentShader:We.points_frag},dashed:{uniforms:jt([ce.common,ce.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:We.linedashed_vert,fragmentShader:We.linedashed_frag},depth:{uniforms:jt([ce.common,ce.displacementmap]),vertexShader:We.depth_vert,fragmentShader:We.depth_frag},normal:{uniforms:jt([ce.common,ce.bumpmap,ce.normalmap,ce.displacementmap,{opacity:{value:1}}]),vertexShader:We.meshnormal_vert,fragmentShader:We.meshnormal_frag},sprite:{uniforms:jt([ce.sprite,ce.fog]),vertexShader:We.sprite_vert,fragmentShader:We.sprite_frag},background:{uniforms:{uvTransform:{value:new ze},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:We.background_vert,fragmentShader:We.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new ze}},vertexShader:We.backgroundCube_vert,fragmentShader:We.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:We.cube_vert,fragmentShader:We.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:We.equirect_vert,fragmentShader:We.equirect_frag},distanceRGBA:{uniforms:jt([ce.common,ce.displacementmap,{referencePosition:{value:new N},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:We.distanceRGBA_vert,fragmentShader:We.distanceRGBA_frag},shadow:{uniforms:jt([ce.lights,ce.fog,{color:{value:new Je(0)},opacity:{value:1}}]),vertexShader:We.shadow_vert,fragmentShader:We.shadow_frag}};Jn.physical={uniforms:jt([Jn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new ze},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new ze},clearcoatNormalScale:{value:new Le(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new ze},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new ze},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new ze},sheen:{value:0},sheenColor:{value:new Je(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new ze},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new ze},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new ze},transmissionSamplerSize:{value:new Le},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new ze},attenuationDistance:{value:0},attenuationColor:{value:new Je(0)},specularColor:{value:new Je(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new ze},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new ze},anisotropyVector:{value:new Le},anisotropyMap:{value:null},anisotropyMapTransform:{value:new ze}}]),vertexShader:We.meshphysical_vert,fragmentShader:We.meshphysical_frag};var ec={r:0,b:0,g:0},vr=new qn,pb=new bt;function mb(n,e,t,i,r,s,a){let o=new Je(0),l=s===!0?0:1,c,h,u=null,f=0,d=null;function g(_){let v=_.isScene===!0?_.background:null;return v&&v.isTexture&&(v=(_.backgroundBlurriness>0?t:e).get(v)),v}function y(_){let v=!1,E=g(_);E===null?p(o,l):E&&E.isColor&&(p(E,1),v=!0);let A=n.xr.getEnvironmentBlendMode();A==="additive"?i.buffers.color.setClear(0,0,0,1,a):A==="alpha-blend"&&i.buffers.color.setClear(0,0,0,0,a),(n.autoClear||v)&&(i.buffers.depth.setTest(!0),i.buffers.depth.setMask(!0),i.buffers.color.setMask(!0),n.clear(n.autoClearColor,n.autoClearDepth,n.autoClearStencil))}function m(_,v){let E=g(v);E&&(E.isCubeTexture||E.mapping===ma)?(h===void 0&&(h=new It(new ts(1,1,1),new an({name:"BackgroundCubeMaterial",uniforms:yr(Jn.backgroundCube.uniforms),vertexShader:Jn.backgroundCube.vertexShader,fragmentShader:Jn.backgroundCube.fragmentShader,side:en,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),h.geometry.deleteAttribute("normal"),h.geometry.deleteAttribute("uv"),h.onBeforeRender=function(A,P,k){this.matrixWorld.copyPosition(k.matrixWorld)},Object.defineProperty(h.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),r.update(h)),vr.copy(v.backgroundRotation),vr.x*=-1,vr.y*=-1,vr.z*=-1,E.isCubeTexture&&E.isRenderTargetTexture===!1&&(vr.y*=-1,vr.z*=-1),h.material.uniforms.envMap.value=E,h.material.uniforms.flipEnvMap.value=E.isCubeTexture&&E.isRenderTargetTexture===!1?-1:1,h.material.uniforms.backgroundBlurriness.value=v.backgroundBlurriness,h.material.uniforms.backgroundIntensity.value=v.backgroundIntensity,h.material.uniforms.backgroundRotation.value.setFromMatrix4(pb.makeRotationFromEuler(vr)),h.material.toneMapped=Ke.getTransfer(E.colorSpace)!==at,(u!==E||f!==E.version||d!==n.toneMapping)&&(h.material.needsUpdate=!0,u=E,f=E.version,d=n.toneMapping),h.layers.enableAll(),_.unshift(h,h.geometry,h.material,0,0,null)):E&&E.isTexture&&(c===void 0&&(c=new It(new fr(2,2),new an({name:"BackgroundMaterial",uniforms:yr(Jn.background.uniforms),vertexShader:Jn.background.vertexShader,fragmentShader:Jn.background.fragmentShader,side:hi,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),r.update(c)),c.material.uniforms.t2D.value=E,c.material.uniforms.backgroundIntensity.value=v.backgroundIntensity,c.material.toneMapped=Ke.getTransfer(E.colorSpace)!==at,E.matrixAutoUpdate===!0&&E.updateMatrix(),c.material.uniforms.uvTransform.value.copy(E.matrix),(u!==E||f!==E.version||d!==n.toneMapping)&&(c.material.needsUpdate=!0,u=E,f=E.version,d=n.toneMapping),c.layers.enableAll(),_.unshift(c,c.geometry,c.material,0,0,null))}function p(_,v){_.getRGB(ec,lu(n)),i.buffers.color.setClear(ec.r,ec.g,ec.b,v,a)}function b(){h!==void 0&&(h.geometry.dispose(),h.material.dispose(),h=void 0),c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0)}return{getClearColor:function(){return o},setClearColor:function(_,v=1){o.set(_),l=v,p(o,l)},getClearAlpha:function(){return l},setClearAlpha:function(_){l=_,p(o,l)},render:y,addToRenderList:m,dispose:b}}function gb(n,e){let t=n.getParameter(n.MAX_VERTEX_ATTRIBS),i={},r=f(null),s=r,a=!1;function o(M,L,V,W,Y){let j=!1,X=u(W,V,L);s!==X&&(s=X,c(s.object)),j=d(M,W,V,Y),j&&g(M,W,V,Y),Y!==null&&e.update(Y,n.ELEMENT_ARRAY_BUFFER),(j||a)&&(a=!1,v(M,L,V,W),Y!==null&&n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,e.get(Y).buffer))}function l(){return n.createVertexArray()}function c(M){return n.bindVertexArray(M)}function h(M){return n.deleteVertexArray(M)}function u(M,L,V){let W=V.wireframe===!0,Y=i[M.id];Y===void 0&&(Y={},i[M.id]=Y);let j=Y[L.id];j===void 0&&(j={},Y[L.id]=j);let X=j[W];return X===void 0&&(X=f(l()),j[W]=X),X}function f(M){let L=[],V=[],W=[];for(let Y=0;Y<t;Y++)L[Y]=0,V[Y]=0,W[Y]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:L,enabledAttributes:V,attributeDivisors:W,object:M,attributes:{},index:null}}function d(M,L,V,W){let Y=s.attributes,j=L.attributes,X=0,re=V.getAttributes();for(let H in re)if(re[H].location>=0){let ee=Y[H],Me=j[H];if(Me===void 0&&(H==="instanceMatrix"&&M.instanceMatrix&&(Me=M.instanceMatrix),H==="instanceColor"&&M.instanceColor&&(Me=M.instanceColor)),ee===void 0||ee.attribute!==Me||Me&&ee.data!==Me.data)return!0;X++}return s.attributesNum!==X||s.index!==W}function g(M,L,V,W){let Y={},j=L.attributes,X=0,re=V.getAttributes();for(let H in re)if(re[H].location>=0){let ee=j[H];ee===void 0&&(H==="instanceMatrix"&&M.instanceMatrix&&(ee=M.instanceMatrix),H==="instanceColor"&&M.instanceColor&&(ee=M.instanceColor));let Me={};Me.attribute=ee,ee&&ee.data&&(Me.data=ee.data),Y[H]=Me,X++}s.attributes=Y,s.attributesNum=X,s.index=W}function y(){let M=s.newAttributes;for(let L=0,V=M.length;L<V;L++)M[L]=0}function m(M){p(M,0)}function p(M,L){let V=s.newAttributes,W=s.enabledAttributes,Y=s.attributeDivisors;V[M]=1,W[M]===0&&(n.enableVertexAttribArray(M),W[M]=1),Y[M]!==L&&(n.vertexAttribDivisor(M,L),Y[M]=L)}function b(){let M=s.newAttributes,L=s.enabledAttributes;for(let V=0,W=L.length;V<W;V++)L[V]!==M[V]&&(n.disableVertexAttribArray(V),L[V]=0)}function _(M,L,V,W,Y,j,X){X===!0?n.vertexAttribIPointer(M,L,V,Y,j):n.vertexAttribPointer(M,L,V,W,Y,j)}function v(M,L,V,W){y();let Y=W.attributes,j=V.getAttributes(),X=L.defaultAttributeValues;for(let re in j){let H=j[re];if(H.location>=0){let oe=Y[re];if(oe===void 0&&(re==="instanceMatrix"&&M.instanceMatrix&&(oe=M.instanceMatrix),re==="instanceColor"&&M.instanceColor&&(oe=M.instanceColor)),oe!==void 0){let ee=oe.normalized,Me=oe.itemSize,$e=e.get(oe);if($e===void 0)continue;let rt=$e.buffer,Ue=$e.type,qe=$e.bytesPerElement,$=Ue===n.INT||Ue===n.UNSIGNED_INT||oe.gpuType===bl;if(oe.isInterleavedBufferAttribute){let Z=oe.data,me=Z.stride,ve=oe.offset;if(Z.isInstancedInterleavedBuffer){for(let ue=0;ue<H.locationSize;ue++)p(H.location+ue,Z.meshPerAttribute);M.isInstancedMesh!==!0&&W._maxInstanceCount===void 0&&(W._maxInstanceCount=Z.meshPerAttribute*Z.count)}else for(let ue=0;ue<H.locationSize;ue++)m(H.location+ue);n.bindBuffer(n.ARRAY_BUFFER,rt);for(let ue=0;ue<H.locationSize;ue++)_(H.location+ue,Me/H.locationSize,Ue,ee,me*qe,(ve+Me/H.locationSize*ue)*qe,$)}else{if(oe.isInstancedBufferAttribute){for(let Z=0;Z<H.locationSize;Z++)p(H.location+Z,oe.meshPerAttribute);M.isInstancedMesh!==!0&&W._maxInstanceCount===void 0&&(W._maxInstanceCount=oe.meshPerAttribute*oe.count)}else for(let Z=0;Z<H.locationSize;Z++)m(H.location+Z);n.bindBuffer(n.ARRAY_BUFFER,rt);for(let Z=0;Z<H.locationSize;Z++)_(H.location+Z,Me/H.locationSize,Ue,ee,Me*qe,Me/H.locationSize*Z*qe,$)}}else if(X!==void 0){let ee=X[re];if(ee!==void 0)switch(ee.length){case 2:n.vertexAttrib2fv(H.location,ee);break;case 3:n.vertexAttrib3fv(H.location,ee);break;case 4:n.vertexAttrib4fv(H.location,ee);break;default:n.vertexAttrib1fv(H.location,ee)}}}}b()}function E(){k();for(let M in i){let L=i[M];for(let V in L){let W=L[V];for(let Y in W)h(W[Y].object),delete W[Y];delete L[V]}delete i[M]}}function A(M){if(i[M.id]===void 0)return;let L=i[M.id];for(let V in L){let W=L[V];for(let Y in W)h(W[Y].object),delete W[Y];delete L[V]}delete i[M.id]}function P(M){for(let L in i){let V=i[L];if(V[M.id]===void 0)continue;let W=V[M.id];for(let Y in W)h(W[Y].object),delete W[Y];delete V[M.id]}}function k(){w(),a=!0,s!==r&&(s=r,c(s.object))}function w(){r.geometry=null,r.program=null,r.wireframe=!1}return{setup:o,reset:k,resetDefaultState:w,dispose:E,releaseStatesOfGeometry:A,releaseStatesOfProgram:P,initAttributes:y,enableAttribute:m,disableUnusedAttributes:b}}function yb(n,e,t){let i;function r(c){i=c}function s(c,h){n.drawArrays(i,c,h),t.update(h,i,1)}function a(c,h,u){u!==0&&(n.drawArraysInstanced(i,c,h,u),t.update(h,i,u))}function o(c,h,u){if(u===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(i,c,0,h,0,u);let d=0;for(let g=0;g<u;g++)d+=h[g];t.update(d,i,1)}function l(c,h,u,f){if(u===0)return;let d=e.get("WEBGL_multi_draw");if(d===null)for(let g=0;g<c.length;g++)a(c[g],h[g],f[g]);else{d.multiDrawArraysInstancedWEBGL(i,c,0,h,0,f,0,u);let g=0;for(let y=0;y<u;y++)g+=h[y]*f[y];t.update(g,i,1)}}this.setMode=r,this.render=s,this.renderInstances=a,this.renderMultiDraw=o,this.renderMultiDrawInstances=l}function vb(n,e,t,i){let r;function s(){if(r!==void 0)return r;if(e.has("EXT_texture_filter_anisotropic")===!0){let P=e.get("EXT_texture_filter_anisotropic");r=n.getParameter(P.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else r=0;return r}function a(P){return!(P!==on&&i.convert(P)!==n.getParameter(n.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(P){let k=P===cs&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(P!==jn&&i.convert(P)!==n.getParameter(n.IMPLEMENTATION_COLOR_READ_TYPE)&&P!==Cn&&!k)}function l(P){if(P==="highp"){if(n.getShaderPrecisionFormat(n.VERTEX_SHADER,n.HIGH_FLOAT).precision>0&&n.getShaderPrecisionFormat(n.FRAGMENT_SHADER,n.HIGH_FLOAT).precision>0)return"highp";P="mediump"}return P==="mediump"&&n.getShaderPrecisionFormat(n.VERTEX_SHADER,n.MEDIUM_FLOAT).precision>0&&n.getShaderPrecisionFormat(n.FRAGMENT_SHADER,n.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=t.precision!==void 0?t.precision:"highp",h=l(c);h!==c&&(console.warn("THREE.WebGLRenderer:",c,"not supported, using",h,"instead."),c=h);let u=t.logarithmicDepthBuffer===!0,f=t.reversedDepthBuffer===!0&&e.has("EXT_clip_control"),d=n.getParameter(n.MAX_TEXTURE_IMAGE_UNITS),g=n.getParameter(n.MAX_VERTEX_TEXTURE_IMAGE_UNITS),y=n.getParameter(n.MAX_TEXTURE_SIZE),m=n.getParameter(n.MAX_CUBE_MAP_TEXTURE_SIZE),p=n.getParameter(n.MAX_VERTEX_ATTRIBS),b=n.getParameter(n.MAX_VERTEX_UNIFORM_VECTORS),_=n.getParameter(n.MAX_VARYING_VECTORS),v=n.getParameter(n.MAX_FRAGMENT_UNIFORM_VECTORS),E=g>0,A=n.getParameter(n.MAX_SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:s,getMaxPrecision:l,textureFormatReadable:a,textureTypeReadable:o,precision:c,logarithmicDepthBuffer:u,reversedDepthBuffer:f,maxTextures:d,maxVertexTextures:g,maxTextureSize:y,maxCubemapSize:m,maxAttributes:p,maxVertexUniforms:b,maxVaryings:_,maxFragmentUniforms:v,vertexTextures:E,maxSamples:A}}function xb(n){let e=this,t=null,i=0,r=!1,s=!1,a=new wn,o=new ze,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(u,f){let d=u.length!==0||f||i!==0||r;return r=f,i=u.length,d},this.beginShadows=function(){s=!0,h(null)},this.endShadows=function(){s=!1},this.setGlobalState=function(u,f){t=h(u,f,0)},this.setState=function(u,f,d){let g=u.clippingPlanes,y=u.clipIntersection,m=u.clipShadows,p=n.get(u);if(!r||g===null||g.length===0||s&&!m)s?h(null):c();else{let b=s?0:i,_=b*4,v=p.clippingState||null;l.value=v,v=h(g,f,_,d);for(let E=0;E!==_;++E)v[E]=t[E];p.clippingState=v,this.numIntersection=y?this.numPlanes:0,this.numPlanes+=b}};function c(){l.value!==t&&(l.value=t,l.needsUpdate=i>0),e.numPlanes=i,e.numIntersection=0}function h(u,f,d,g){let y=u!==null?u.length:0,m=null;if(y!==0){if(m=l.value,g!==!0||m===null){let p=d+y*4,b=f.matrixWorldInverse;o.getNormalMatrix(b),(m===null||m.length<p)&&(m=new Float32Array(p));for(let _=0,v=d;_!==y;++_,v+=4)a.copy(u[_]).applyMatrix4(b,o),a.normal.toArray(m,v),m[v+3]=a.constant}l.value=m,l.needsUpdate=!0}return e.numPlanes=y,e.numIntersection=0,m}}function bb(n){let e=new WeakMap;function t(a,o){return o===yl?a.mapping=mr:o===vl&&(a.mapping=gr),a}function i(a){if(a&&a.isTexture){let o=a.mapping;if(o===yl||o===vl)if(e.has(a)){let l=e.get(a).texture;return t(l,a.mapping)}else{let l=a.image;if(l&&l.height>0){let c=new Yo(l.height);return c.fromEquirectangularTexture(n,a),e.set(a,c),a.addEventListener("dispose",r),t(c.texture,a.mapping)}else return null}}return a}function r(a){let o=a.target;o.removeEventListener("dispose",r);let l=e.get(o);l!==void 0&&(e.delete(o),l.dispose())}function s(){e=new WeakMap}return{get:i,dispose:s}}var fs=4,Mp=[.125,.215,.35,.446,.526,.582],_r=20,du=new Un,Ep=new Je,fu=null,pu=0,mu=0,gu=!1,br=(1+Math.sqrt(5))/2,ds=1/br,Tp=[new N(-br,ds,0),new N(br,ds,0),new N(-ds,0,br),new N(ds,0,br),new N(0,br,-ds),new N(0,br,ds),new N(-1,1,-1),new N(1,1,-1),new N(-1,1,1),new N(1,1,1)],_b=new N,ic=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(e,t=0,i=.1,r=100,s={}){let{size:a=256,position:o=_b}=s;fu=this._renderer.getRenderTarget(),pu=this._renderer.getActiveCubeFace(),mu=this._renderer.getActiveMipmapLevel(),gu=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);let l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(e,i,r,l,o),t>0&&this._blur(l,0,0,t),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Rp(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Cp(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodPlanes.length;e++)this._lodPlanes[e].dispose()}_cleanup(e){this._renderer.setRenderTarget(fu,pu,mu),this._renderer.xr.enabled=gu,e.scissorTest=!1,tc(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===mr||e.mapping===gr?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),fu=this._renderer.getRenderTarget(),pu=this._renderer.getActiveCubeFace(),mu=this._renderer.getActiveMipmapLevel(),gu=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let i=t||this._allocateTargets();return this._textureToCubeUV(e,i),this._applyPMREM(i),this._cleanup(i),i}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,i={magFilter:Nn,minFilter:Nn,generateMipmaps:!1,type:cs,format:on,colorSpace:ui,depthBuffer:!1},r=Ap(e,t,i);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Ap(e,t,i);let{_lodMax:s}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=Sb(s)),this._blurMaterial=wb(s,e,t)}return r}_compileMaterial(e){let t=new It(this._lodPlanes[0],e);this._renderer.compile(t,du)}_sceneToCubeUV(e,t,i,r,s){let l=new $t(90,1,t,i),c=[1,-1,1,1,1,1],h=[1,1,1,-1,-1,-1],u=this._renderer,f=u.autoClear,d=u.toneMapping;u.getClearColor(Ep),u.toneMapping=fi,u.autoClear=!1,u.state.buffers.depth.getReversed()&&(u.setRenderTarget(r),u.clearDepth(),u.setRenderTarget(null));let y=new na({name:"PMREM.Background",side:en,depthWrite:!1,depthTest:!1}),m=new It(new ts,y),p=!1,b=e.background;b?b.isColor&&(y.color.copy(b),e.background=null,p=!0):(y.color.copy(Ep),p=!0);for(let _=0;_<6;_++){let v=_%3;v===0?(l.up.set(0,c[_],0),l.position.set(s.x,s.y,s.z),l.lookAt(s.x+h[_],s.y,s.z)):v===1?(l.up.set(0,0,c[_]),l.position.set(s.x,s.y,s.z),l.lookAt(s.x,s.y+h[_],s.z)):(l.up.set(0,c[_],0),l.position.set(s.x,s.y,s.z),l.lookAt(s.x,s.y,s.z+h[_]));let E=this._cubeSize;tc(r,v*E,_>2?E:0,E,E),u.setRenderTarget(r),p&&u.render(m,l),u.render(e,l)}m.geometry.dispose(),m.material.dispose(),u.toneMapping=d,u.autoClear=f,e.background=b}_textureToCubeUV(e,t){let i=this._renderer,r=e.mapping===mr||e.mapping===gr;r?(this._cubemapMaterial===null&&(this._cubemapMaterial=Rp()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Cp());let s=r?this._cubemapMaterial:this._equirectMaterial,a=new It(this._lodPlanes[0],s),o=s.uniforms;o.envMap.value=e;let l=this._cubeSize;tc(t,0,0,3*l,2*l),i.setRenderTarget(t),i.render(a,du)}_applyPMREM(e){let t=this._renderer,i=t.autoClear;t.autoClear=!1;let r=this._lodPlanes.length;for(let s=1;s<r;s++){let a=Math.sqrt(this._sigmas[s]*this._sigmas[s]-this._sigmas[s-1]*this._sigmas[s-1]),o=Tp[(r-s-1)%Tp.length];this._blur(e,s-1,s,a,o)}t.autoClear=i}_blur(e,t,i,r,s){let a=this._pingPongRenderTarget;this._halfBlur(e,a,t,i,r,"latitudinal",s),this._halfBlur(a,e,i,i,r,"longitudinal",s)}_halfBlur(e,t,i,r,s,a,o){let l=this._renderer,c=this._blurMaterial;a!=="latitudinal"&&a!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");let h=3,u=new It(this._lodPlanes[r],c),f=c.uniforms,d=this._sizeLods[i]-1,g=isFinite(s)?Math.PI/(2*d):2*Math.PI/(2*_r-1),y=s/g,m=isFinite(s)?1+Math.floor(h*y):_r;m>_r&&console.warn(`sigmaRadians, ${s}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${_r}`);let p=[],b=0;for(let P=0;P<_r;++P){let k=P/y,w=Math.exp(-k*k/2);p.push(w),P===0?b+=w:P<m&&(b+=2*w)}for(let P=0;P<p.length;P++)p[P]=p[P]/b;f.envMap.value=e.texture,f.samples.value=m,f.weights.value=p,f.latitudinal.value=a==="latitudinal",o&&(f.poleAxis.value=o);let{_lodMax:_}=this;f.dTheta.value=g,f.mipInt.value=_-i;let v=this._sizeLods[r],E=3*v*(r>_-fs?r-_+fs:0),A=4*(this._cubeSize-v);tc(t,E,A,3*v,2*v),l.setRenderTarget(t),l.render(u,du)}};function Sb(n){let e=[],t=[],i=[],r=n,s=n-fs+1+Mp.length;for(let a=0;a<s;a++){let o=Math.pow(2,r);t.push(o);let l=1/o;a>n-fs?l=Mp[a-n+fs-1]:a===0&&(l=0),i.push(l);let c=1/(o-2),h=-c,u=1+c,f=[h,h,u,h,u,u,h,h,u,u,h,u],d=6,g=6,y=3,m=2,p=1,b=new Float32Array(y*g*d),_=new Float32Array(m*g*d),v=new Float32Array(p*g*d);for(let A=0;A<d;A++){let P=A%3*2/3-1,k=A>2?0:-1,w=[P,k,0,P+2/3,k,0,P+2/3,k+1,0,P,k,0,P+2/3,k+1,0,P,k+1,0];b.set(w,y*g*A),_.set(f,m*g*A);let M=[A,A,A,A,A,A];v.set(M,p*g*A)}let E=new wt;E.setAttribute("position",new St(b,y)),E.setAttribute("uv",new St(_,m)),E.setAttribute("faceIndex",new St(v,p)),e.push(E),r>fs&&r--}return{lodPlanes:e,sizeLods:t,sigmas:i}}function Ap(n,e,t){let i=new En(n,e,t);return i.texture.mapping=ma,i.texture.name="PMREM.cubeUv",i.scissorTest=!0,i}function tc(n,e,t,i,r){n.viewport.set(e,t,i,r),n.scissor.set(e,t,i,r)}function wb(n,e,t){let i=new Float32Array(_r),r=new N(0,1,0);return new an({name:"SphericalGaussianBlur",defines:{n:_r,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${n}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:i},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:r}},vertexShader:Tu(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:Bn,depthTest:!1,depthWrite:!1})}function Cp(){return new an({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Tu(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:Bn,depthTest:!1,depthWrite:!1})}function Rp(){return new an({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Tu(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Bn,depthTest:!1,depthWrite:!1})}function Tu(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function Mb(n){let e=new WeakMap,t=null;function i(o){if(o&&o.isTexture){let l=o.mapping,c=l===yl||l===vl,h=l===mr||l===gr;if(c||h){let u=e.get(o),f=u!==void 0?u.texture.pmremVersion:0;if(o.isRenderTargetTexture&&o.pmremVersion!==f)return t===null&&(t=new ic(n)),u=c?t.fromEquirectangular(o,u):t.fromCubemap(o,u),u.texture.pmremVersion=o.pmremVersion,e.set(o,u),u.texture;if(u!==void 0)return u.texture;{let d=o.image;return c&&d&&d.height>0||h&&d&&r(d)?(t===null&&(t=new ic(n)),u=c?t.fromEquirectangular(o):t.fromCubemap(o),u.texture.pmremVersion=o.pmremVersion,e.set(o,u),o.addEventListener("dispose",s),u.texture):null}}}return o}function r(o){let l=0,c=6;for(let h=0;h<c;h++)o[h]!==void 0&&l++;return l===c}function s(o){let l=o.target;l.removeEventListener("dispose",s);let c=e.get(l);c!==void 0&&(e.delete(l),c.dispose())}function a(){e=new WeakMap,t!==null&&(t.dispose(),t=null)}return{get:i,dispose:a}}function Eb(n){let e={};function t(i){if(e[i]!==void 0)return e[i];let r;switch(i){case"WEBGL_depth_texture":r=n.getExtension("WEBGL_depth_texture")||n.getExtension("MOZ_WEBGL_depth_texture")||n.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":r=n.getExtension("EXT_texture_filter_anisotropic")||n.getExtension("MOZ_EXT_texture_filter_anisotropic")||n.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":r=n.getExtension("WEBGL_compressed_texture_s3tc")||n.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||n.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":r=n.getExtension("WEBGL_compressed_texture_pvrtc")||n.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:r=n.getExtension(i)}return e[i]=r,r}return{has:function(i){return t(i)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(i){let r=t(i);return r===null&&Qr("THREE.WebGLRenderer: "+i+" extension not supported."),r}}}function Tb(n,e,t,i){let r={},s=new WeakMap;function a(u){let f=u.target;f.index!==null&&e.remove(f.index);for(let g in f.attributes)e.remove(f.attributes[g]);f.removeEventListener("dispose",a),delete r[f.id];let d=s.get(f);d&&(e.remove(d),s.delete(f)),i.releaseStatesOfGeometry(f),f.isInstancedBufferGeometry===!0&&delete f._maxInstanceCount,t.memory.geometries--}function o(u,f){return r[f.id]===!0||(f.addEventListener("dispose",a),r[f.id]=!0,t.memory.geometries++),f}function l(u){let f=u.attributes;for(let d in f)e.update(f[d],n.ARRAY_BUFFER)}function c(u){let f=[],d=u.index,g=u.attributes.position,y=0;if(d!==null){let b=d.array;y=d.version;for(let _=0,v=b.length;_<v;_+=3){let E=b[_+0],A=b[_+1],P=b[_+2];f.push(E,A,A,P,P,E)}}else if(g!==void 0){let b=g.array;y=g.version;for(let _=0,v=b.length/3-1;_<v;_+=3){let E=_+0,A=_+1,P=_+2;f.push(E,A,A,P,P,E)}}else return;let m=new(ou(f)?ra:ia)(f,1);m.version=y;let p=s.get(u);p&&e.remove(p),s.set(u,m)}function h(u){let f=s.get(u);if(f){let d=u.index;d!==null&&f.version<d.version&&c(u)}else c(u);return s.get(u)}return{get:o,update:l,getWireframeAttribute:h}}function Ab(n,e,t){let i;function r(f){i=f}let s,a;function o(f){s=f.type,a=f.bytesPerElement}function l(f,d){n.drawElements(i,d,s,f*a),t.update(d,i,1)}function c(f,d,g){g!==0&&(n.drawElementsInstanced(i,d,s,f*a,g),t.update(d,i,g))}function h(f,d,g){if(g===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(i,d,0,s,f,0,g);let m=0;for(let p=0;p<g;p++)m+=d[p];t.update(m,i,1)}function u(f,d,g,y){if(g===0)return;let m=e.get("WEBGL_multi_draw");if(m===null)for(let p=0;p<f.length;p++)c(f[p]/a,d[p],y[p]);else{m.multiDrawElementsInstancedWEBGL(i,d,0,s,f,0,y,0,g);let p=0;for(let b=0;b<g;b++)p+=d[b]*y[b];t.update(p,i,1)}}this.setMode=r,this.setIndex=o,this.render=l,this.renderInstances=c,this.renderMultiDraw=h,this.renderMultiDrawInstances=u}function Cb(n){let e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function i(s,a,o){switch(t.calls++,a){case n.TRIANGLES:t.triangles+=o*(s/3);break;case n.LINES:t.lines+=o*(s/2);break;case n.LINE_STRIP:t.lines+=o*(s-1);break;case n.LINE_LOOP:t.lines+=o*s;break;case n.POINTS:t.points+=o*s;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",a);break}}function r(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:r,update:i}}function Rb(n,e,t){let i=new WeakMap,r=new ut;function s(a,o,l){let c=a.morphTargetInfluences,h=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,u=h!==void 0?h.length:0,f=i.get(o);if(f===void 0||f.count!==u){let w=function(){P.dispose(),i.delete(o),o.removeEventListener("dispose",w)};f!==void 0&&f.texture.dispose();let d=o.morphAttributes.position!==void 0,g=o.morphAttributes.normal!==void 0,y=o.morphAttributes.color!==void 0,m=o.morphAttributes.position||[],p=o.morphAttributes.normal||[],b=o.morphAttributes.color||[],_=0;d===!0&&(_=1),g===!0&&(_=2),y===!0&&(_=3);let v=o.attributes.position.count*_,E=1;v>e.maxTextureSize&&(E=Math.ceil(v/e.maxTextureSize),v=e.maxTextureSize);let A=new Float32Array(v*E*4*u),P=new ea(A,v,E,u);P.type=Cn,P.needsUpdate=!0;let k=_*4;for(let M=0;M<u;M++){let L=m[M],V=p[M],W=b[M],Y=v*E*4*M;for(let j=0;j<L.count;j++){let X=j*k;d===!0&&(r.fromBufferAttribute(L,j),A[Y+X+0]=r.x,A[Y+X+1]=r.y,A[Y+X+2]=r.z,A[Y+X+3]=0),g===!0&&(r.fromBufferAttribute(V,j),A[Y+X+4]=r.x,A[Y+X+5]=r.y,A[Y+X+6]=r.z,A[Y+X+7]=0),y===!0&&(r.fromBufferAttribute(W,j),A[Y+X+8]=r.x,A[Y+X+9]=r.y,A[Y+X+10]=r.z,A[Y+X+11]=W.itemSize===4?r.w:1)}}f={count:u,texture:P,size:new Le(v,E)},i.set(o,f),o.addEventListener("dispose",w)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)l.getUniforms().setValue(n,"morphTexture",a.morphTexture,t);else{let d=0;for(let y=0;y<c.length;y++)d+=c[y];let g=o.morphTargetsRelative?1:1-d;l.getUniforms().setValue(n,"morphTargetBaseInfluence",g),l.getUniforms().setValue(n,"morphTargetInfluences",c)}l.getUniforms().setValue(n,"morphTargetsTexture",f.texture,t),l.getUniforms().setValue(n,"morphTargetsTextureSize",f.size)}return{update:s}}function Pb(n,e,t,i){let r=new WeakMap;function s(l){let c=i.render.frame,h=l.geometry,u=e.get(l,h);if(r.get(u)!==c&&(e.update(u),r.set(u,c)),l.isInstancedMesh&&(l.hasEventListener("dispose",o)===!1&&l.addEventListener("dispose",o),r.get(l)!==c&&(t.update(l.instanceMatrix,n.ARRAY_BUFFER),l.instanceColor!==null&&t.update(l.instanceColor,n.ARRAY_BUFFER),r.set(l,c))),l.isSkinnedMesh){let f=l.skeleton;r.get(f)!==c&&(f.update(),r.set(f,c))}return u}function a(){r=new WeakMap}function o(l){let c=l.target;c.removeEventListener("dispose",o),t.remove(c.instanceMatrix),c.instanceColor!==null&&t.remove(c.instanceColor)}return{update:s,dispose:a}}var Yp=new Qt,Pp=new ha(1,1),jp=new ea,Jp=new Xo,Zp=new aa,Ip=[],Lp=[],Dp=new Float32Array(16),kp=new Float32Array(9),Np=new Float32Array(4);function ms(n,e,t){let i=n[0];if(i<=0||i>0)return n;let r=e*t,s=Ip[r];if(s===void 0&&(s=new Float32Array(r),Ip[r]=s),e!==0){i.toArray(s,0);for(let a=1,o=0;a!==e;++a)o+=t,n[a].toArray(s,o)}return s}function Lt(n,e){if(n.length!==e.length)return!1;for(let t=0,i=n.length;t<i;t++)if(n[t]!==e[t])return!1;return!0}function Dt(n,e){for(let t=0,i=e.length;t<i;t++)n[t]=e[t]}function sc(n,e){let t=Lp[e];t===void 0&&(t=new Int32Array(e),Lp[e]=t);for(let i=0;i!==e;++i)t[i]=n.allocateTextureUnit();return t}function Ib(n,e){let t=this.cache;t[0]!==e&&(n.uniform1f(this.addr,e),t[0]=e)}function Lb(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(n.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Lt(t,e))return;n.uniform2fv(this.addr,e),Dt(t,e)}}function Db(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(n.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(n.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(Lt(t,e))return;n.uniform3fv(this.addr,e),Dt(t,e)}}function kb(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(n.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Lt(t,e))return;n.uniform4fv(this.addr,e),Dt(t,e)}}function Nb(n,e){let t=this.cache,i=e.elements;if(i===void 0){if(Lt(t,e))return;n.uniformMatrix2fv(this.addr,!1,e),Dt(t,e)}else{if(Lt(t,i))return;Np.set(i),n.uniformMatrix2fv(this.addr,!1,Np),Dt(t,i)}}function Ob(n,e){let t=this.cache,i=e.elements;if(i===void 0){if(Lt(t,e))return;n.uniformMatrix3fv(this.addr,!1,e),Dt(t,e)}else{if(Lt(t,i))return;kp.set(i),n.uniformMatrix3fv(this.addr,!1,kp),Dt(t,i)}}function Ub(n,e){let t=this.cache,i=e.elements;if(i===void 0){if(Lt(t,e))return;n.uniformMatrix4fv(this.addr,!1,e),Dt(t,e)}else{if(Lt(t,i))return;Dp.set(i),n.uniformMatrix4fv(this.addr,!1,Dp),Dt(t,i)}}function Fb(n,e){let t=this.cache;t[0]!==e&&(n.uniform1i(this.addr,e),t[0]=e)}function Bb(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(n.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Lt(t,e))return;n.uniform2iv(this.addr,e),Dt(t,e)}}function zb(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(n.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Lt(t,e))return;n.uniform3iv(this.addr,e),Dt(t,e)}}function Vb(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(n.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Lt(t,e))return;n.uniform4iv(this.addr,e),Dt(t,e)}}function Hb(n,e){let t=this.cache;t[0]!==e&&(n.uniform1ui(this.addr,e),t[0]=e)}function Gb(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(n.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Lt(t,e))return;n.uniform2uiv(this.addr,e),Dt(t,e)}}function Wb(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(n.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Lt(t,e))return;n.uniform3uiv(this.addr,e),Dt(t,e)}}function $b(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(n.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Lt(t,e))return;n.uniform4uiv(this.addr,e),Dt(t,e)}}function Xb(n,e,t){let i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r);let s;this.type===n.SAMPLER_2D_SHADOW?(Pp.compareFunction=ru,s=Pp):s=Yp,t.setTexture2D(e||s,r)}function qb(n,e,t){let i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r),t.setTexture3D(e||Jp,r)}function Yb(n,e,t){let i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r),t.setTextureCube(e||Zp,r)}function jb(n,e,t){let i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r),t.setTexture2DArray(e||jp,r)}function Jb(n){switch(n){case 5126:return Ib;case 35664:return Lb;case 35665:return Db;case 35666:return kb;case 35674:return Nb;case 35675:return Ob;case 35676:return Ub;case 5124:case 35670:return Fb;case 35667:case 35671:return Bb;case 35668:case 35672:return zb;case 35669:case 35673:return Vb;case 5125:return Hb;case 36294:return Gb;case 36295:return Wb;case 36296:return $b;case 35678:case 36198:case 36298:case 36306:case 35682:return Xb;case 35679:case 36299:case 36307:return qb;case 35680:case 36300:case 36308:case 36293:return Yb;case 36289:case 36303:case 36311:case 36292:return jb}}function Zb(n,e){n.uniform1fv(this.addr,e)}function Kb(n,e){let t=ms(e,this.size,2);n.uniform2fv(this.addr,t)}function Qb(n,e){let t=ms(e,this.size,3);n.uniform3fv(this.addr,t)}function e_(n,e){let t=ms(e,this.size,4);n.uniform4fv(this.addr,t)}function t_(n,e){let t=ms(e,this.size,4);n.uniformMatrix2fv(this.addr,!1,t)}function n_(n,e){let t=ms(e,this.size,9);n.uniformMatrix3fv(this.addr,!1,t)}function i_(n,e){let t=ms(e,this.size,16);n.uniformMatrix4fv(this.addr,!1,t)}function r_(n,e){n.uniform1iv(this.addr,e)}function s_(n,e){n.uniform2iv(this.addr,e)}function a_(n,e){n.uniform3iv(this.addr,e)}function o_(n,e){n.uniform4iv(this.addr,e)}function l_(n,e){n.uniform1uiv(this.addr,e)}function c_(n,e){n.uniform2uiv(this.addr,e)}function h_(n,e){n.uniform3uiv(this.addr,e)}function u_(n,e){n.uniform4uiv(this.addr,e)}function d_(n,e,t){let i=this.cache,r=e.length,s=sc(t,r);Lt(i,s)||(n.uniform1iv(this.addr,s),Dt(i,s));for(let a=0;a!==r;++a)t.setTexture2D(e[a]||Yp,s[a])}function f_(n,e,t){let i=this.cache,r=e.length,s=sc(t,r);Lt(i,s)||(n.uniform1iv(this.addr,s),Dt(i,s));for(let a=0;a!==r;++a)t.setTexture3D(e[a]||Jp,s[a])}function p_(n,e,t){let i=this.cache,r=e.length,s=sc(t,r);Lt(i,s)||(n.uniform1iv(this.addr,s),Dt(i,s));for(let a=0;a!==r;++a)t.setTextureCube(e[a]||Zp,s[a])}function m_(n,e,t){let i=this.cache,r=e.length,s=sc(t,r);Lt(i,s)||(n.uniform1iv(this.addr,s),Dt(i,s));for(let a=0;a!==r;++a)t.setTexture2DArray(e[a]||jp,s[a])}function g_(n){switch(n){case 5126:return Zb;case 35664:return Kb;case 35665:return Qb;case 35666:return e_;case 35674:return t_;case 35675:return n_;case 35676:return i_;case 5124:case 35670:return r_;case 35667:case 35671:return s_;case 35668:case 35672:return a_;case 35669:case 35673:return o_;case 5125:return l_;case 36294:return c_;case 36295:return h_;case 36296:return u_;case 35678:case 36198:case 36298:case 36306:case 35682:return d_;case 35679:case 36299:case 36307:return f_;case 35680:case 36300:case 36308:case 36293:return p_;case 36289:case 36303:case 36311:case 36292:return m_}}var vu=class{constructor(e,t,i){this.id=e,this.addr=i,this.cache=[],this.type=t.type,this.setValue=Jb(t.type)}},xu=class{constructor(e,t,i){this.id=e,this.addr=i,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=g_(t.type)}},bu=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,i){let r=this.seq;for(let s=0,a=r.length;s!==a;++s){let o=r[s];o.setValue(e,t[o.id],i)}}},yu=/(\w+)(\])?(\[|\.)?/g;function Op(n,e){n.seq.push(e),n.map[e.id]=e}function y_(n,e,t){let i=n.name,r=i.length;for(yu.lastIndex=0;;){let s=yu.exec(i),a=yu.lastIndex,o=s[1],l=s[2]==="]",c=s[3];if(l&&(o=o|0),c===void 0||c==="["&&a+2===r){Op(t,c===void 0?new vu(o,n,e):new xu(o,n,e));break}else{let u=t.map[o];u===void 0&&(u=new bu(o),Op(t,u)),t=u}}}var ps=class{constructor(e,t){this.seq=[],this.map={};let i=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let r=0;r<i;++r){let s=e.getActiveUniform(t,r),a=e.getUniformLocation(t,s.name);y_(s,a,this)}}setValue(e,t,i,r){let s=this.map[t];s!==void 0&&s.setValue(e,i,r)}setOptional(e,t,i){let r=t[i];r!==void 0&&this.setValue(e,i,r)}static upload(e,t,i,r){for(let s=0,a=t.length;s!==a;++s){let o=t[s],l=i[o.id];l.needsUpdate!==!1&&o.setValue(e,l.value,r)}}static seqWithValue(e,t){let i=[];for(let r=0,s=e.length;r!==s;++r){let a=e[r];a.id in t&&i.push(a)}return i}};function Up(n,e,t){let i=n.createShader(e);return n.shaderSource(i,t),n.compileShader(i),i}var v_=37297,x_=0;function b_(n,e){let t=n.split(`
`),i=[],r=Math.max(e-6,0),s=Math.min(e+6,t.length);for(let a=r;a<s;a++){let o=a+1;i.push(`${o===e?">":" "} ${o}: ${t[a]}`)}return i.join(`
`)}var Fp=new ze;function __(n){Ke._getMatrix(Fp,Ke.workingColorSpace,n);let e=`mat3( ${Fp.elements.map(t=>t.toFixed(4))} )`;switch(Ke.getTransfer(n)){case Zs:return[e,"LinearTransferOETF"];case at:return[e,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space: ",n),[e,"LinearTransferOETF"]}}function Bp(n,e,t){let i=n.getShaderParameter(e,n.COMPILE_STATUS),s=(n.getShaderInfoLog(e)||"").trim();if(i&&s==="")return"";let a=/ERROR: 0:(\d+)/.exec(s);if(a){let o=parseInt(a[1]);return t.toUpperCase()+`

`+s+`

`+b_(n.getShaderSource(e),o)}else return s}function S_(n,e){let t=__(e);return[`vec4 ${n}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}function w_(n,e){let t;switch(e){case ep:t="Linear";break;case tp:t="Reinhard";break;case np:t="Cineon";break;case ip:t="ACESFilmic";break;case sp:t="AgX";break;case ap:t="Neutral";break;case rp:t="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",e),t="Linear"}return"vec3 "+n+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}var nc=new N;function M_(){Ke.getLuminanceCoefficients(nc);let n=nc.x.toFixed(4),e=nc.y.toFixed(4),t=nc.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${n}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function E_(n){return[n.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",n.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Sa).join(`
`)}function T_(n){let e=[];for(let t in n){let i=n[t];i!==!1&&e.push("#define "+t+" "+i)}return e.join(`
`)}function A_(n,e){let t={},i=n.getProgramParameter(e,n.ACTIVE_ATTRIBUTES);for(let r=0;r<i;r++){let s=n.getActiveAttrib(e,r),a=s.name,o=1;s.type===n.FLOAT_MAT2&&(o=2),s.type===n.FLOAT_MAT3&&(o=3),s.type===n.FLOAT_MAT4&&(o=4),t[a]={type:s.type,location:n.getAttribLocation(e,a),locationSize:o}}return t}function Sa(n){return n!==""}function zp(n,e){let t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return n.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function Vp(n,e){return n.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}var C_=/^[ \t]*#include +<([\w\d./]+)>/gm;function _u(n){return n.replace(C_,P_)}var R_=new Map;function P_(n,e){let t=We[e];if(t===void 0){let i=R_.get(e);if(i!==void 0)t=We[i],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,i);else throw new Error("Can not resolve #include <"+e+">")}return _u(t)}var I_=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Hp(n){return n.replace(I_,L_)}function L_(n,e,t,i){let r="";for(let s=parseInt(e);s<parseInt(t);s++)r+=i.replace(/\[\s*i\s*\]/g,"[ "+s+" ]").replace(/UNROLLED_LOOP_INDEX/g,s);return r}function Gp(n){let e=`precision ${n.precision} float;
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
#define LOW_PRECISION`),e}function D_(n){let e="SHADOWMAP_TYPE_BASIC";return n.shadowMapType===Wh?e="SHADOWMAP_TYPE_PCF":n.shadowMapType===Df?e="SHADOWMAP_TYPE_PCF_SOFT":n.shadowMapType===Yn&&(e="SHADOWMAP_TYPE_VSM"),e}function k_(n){let e="ENVMAP_TYPE_CUBE";if(n.envMap)switch(n.envMapMode){case mr:case gr:e="ENVMAP_TYPE_CUBE";break;case ma:e="ENVMAP_TYPE_CUBE_UV";break}return e}function N_(n){let e="ENVMAP_MODE_REFLECTION";return n.envMap&&n.envMapMode===gr&&(e="ENVMAP_MODE_REFRACTION"),e}function O_(n){let e="ENVMAP_BLENDING_NONE";if(n.envMap)switch(n.combine){case Yh:e="ENVMAP_BLENDING_MULTIPLY";break;case Kf:e="ENVMAP_BLENDING_MIX";break;case Qf:e="ENVMAP_BLENDING_ADD";break}return e}function U_(n){let e=n.envMapCubeUVHeight;if(e===null)return null;let t=Math.log2(e)-2,i=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),112)),texelHeight:i,maxMip:t}}function F_(n,e,t,i){let r=n.getContext(),s=t.defines,a=t.vertexShader,o=t.fragmentShader,l=D_(t),c=k_(t),h=N_(t),u=O_(t),f=U_(t),d=E_(t),g=T_(s),y=r.createProgram(),m,p,b=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(m=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g].filter(Sa).join(`
`),m.length>0&&(m+=`
`),p=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g].filter(Sa).join(`
`),p.length>0&&(p+=`
`)):(m=[Gp(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+h:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Sa).join(`
`),p=[Gp(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+c:"",t.envMap?"#define "+h:"",t.envMap?"#define "+u:"",f?"#define CUBEUV_TEXEL_WIDTH "+f.texelWidth:"",f?"#define CUBEUV_TEXEL_HEIGHT "+f.texelHeight:"",f?"#define CUBEUV_MAX_MIP "+f.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor||t.batchingColor?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==fi?"#define TONE_MAPPING":"",t.toneMapping!==fi?We.tonemapping_pars_fragment:"",t.toneMapping!==fi?w_("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",We.colorspace_pars_fragment,S_("linearToOutputTexel",t.outputColorSpace),M_(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(Sa).join(`
`)),a=_u(a),a=zp(a,t),a=Vp(a,t),o=_u(o),o=zp(o,t),o=Vp(o,t),a=Hp(a),o=Hp(o),t.isRawShaderMaterial!==!0&&(b=`#version 300 es
`,m=[d,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,p=["#define varying in",t.glslVersion===_a?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===_a?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+p);let _=b+m+a,v=b+p+o,E=Up(r,r.VERTEX_SHADER,_),A=Up(r,r.FRAGMENT_SHADER,v);r.attachShader(y,E),r.attachShader(y,A),t.index0AttributeName!==void 0?r.bindAttribLocation(y,0,t.index0AttributeName):t.morphTargets===!0&&r.bindAttribLocation(y,0,"position"),r.linkProgram(y);function P(L){if(n.debug.checkShaderErrors){let V=r.getProgramInfoLog(y)||"",W=r.getShaderInfoLog(E)||"",Y=r.getShaderInfoLog(A)||"",j=V.trim(),X=W.trim(),re=Y.trim(),H=!0,oe=!0;if(r.getProgramParameter(y,r.LINK_STATUS)===!1)if(H=!1,typeof n.debug.onShaderError=="function")n.debug.onShaderError(r,y,E,A);else{let ee=Bp(r,E,"vertex"),Me=Bp(r,A,"fragment");console.error("THREE.WebGLProgram: Shader Error "+r.getError()+" - VALIDATE_STATUS "+r.getProgramParameter(y,r.VALIDATE_STATUS)+`

Material Name: `+L.name+`
Material Type: `+L.type+`

Program Info Log: `+j+`
`+ee+`
`+Me)}else j!==""?console.warn("THREE.WebGLProgram: Program Info Log:",j):(X===""||re==="")&&(oe=!1);oe&&(L.diagnostics={runnable:H,programLog:j,vertexShader:{log:X,prefix:m},fragmentShader:{log:re,prefix:p}})}r.deleteShader(E),r.deleteShader(A),k=new ps(r,y),w=A_(r,y)}let k;this.getUniforms=function(){return k===void 0&&P(this),k};let w;this.getAttributes=function(){return w===void 0&&P(this),w};let M=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return M===!1&&(M=r.getProgramParameter(y,v_)),M},this.destroy=function(){i.releaseStatesOfProgram(this),r.deleteProgram(y),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=x_++,this.cacheKey=e,this.usedTimes=1,this.program=y,this.vertexShader=E,this.fragmentShader=A,this}var B_=0,Su=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e){let t=e.vertexShader,i=e.fragmentShader,r=this._getShaderStage(t),s=this._getShaderStage(i),a=this._getShaderCacheForMaterial(e);return a.has(r)===!1&&(a.add(r),r.usedTimes++),a.has(s)===!1&&(a.add(s),s.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let i of t)i.usedTimes--,i.usedTimes===0&&this.shaderCache.delete(i.code);return this.materialCache.delete(e),this}getVertexShaderID(e){return this._getShaderStage(e.vertexShader).id}getFragmentShaderID(e){return this._getShaderStage(e.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,i=t.get(e);return i===void 0&&(i=new Set,t.set(e,i)),i}_getShaderStage(e){let t=this.shaderCache,i=t.get(e);return i===void 0&&(i=new wu(e),t.set(e,i)),i}},wu=class{constructor(e){this.id=B_++,this.code=e,this.usedTimes=0}};function z_(n,e,t,i,r,s,a){let o=new ta,l=new Su,c=new Set,h=[],u=r.logarithmicDepthBuffer,f=r.vertexTextures,d=r.precision,g={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function y(w){return c.add(w),w===0?"uv":`uv${w}`}function m(w,M,L,V,W){let Y=V.fog,j=W.geometry,X=w.isMeshStandardMaterial?V.environment:null,re=(w.isMeshStandardMaterial?t:e).get(w.envMap||X),H=re&&re.mapping===ma?re.image.height:null,oe=g[w.type];w.precision!==null&&(d=r.getMaxPrecision(w.precision),d!==w.precision&&console.warn("THREE.WebGLProgram.getParameters:",w.precision,"not supported, using",d,"instead."));let ee=j.morphAttributes.position||j.morphAttributes.normal||j.morphAttributes.color,Me=ee!==void 0?ee.length:0,$e=0;j.morphAttributes.position!==void 0&&($e=1),j.morphAttributes.normal!==void 0&&($e=2),j.morphAttributes.color!==void 0&&($e=3);let rt,Ue,qe,$;if(oe){let nt=Jn[oe];rt=nt.vertexShader,Ue=nt.fragmentShader}else rt=w.vertexShader,Ue=w.fragmentShader,l.update(w),qe=l.getVertexShaderID(w),$=l.getFragmentShaderID(w);let Z=n.getRenderTarget(),me=n.state.buffers.depth.getReversed(),ve=W.isInstancedMesh===!0,ue=W.isBatchedMesh===!0,Ze=!!w.map,Ct=!!w.matcap,C=!!re,dt=!!w.aoMap,Be=!!w.lightMap,Ne=!!w.bumpMap,_e=!!w.normalMap,yt=!!w.displacementMap,Se=!!w.emissiveMap,He=!!w.metalnessMap,Nt=!!w.roughnessMap,Mt=w.anisotropy>0,T=w.clearcoat>0,x=w.dispersion>0,F=w.iridescence>0,q=w.sheen>0,K=w.transmission>0,G=Mt&&!!w.anisotropyMap,Ae=T&&!!w.clearcoatMap,ae=T&&!!w.clearcoatNormalMap,we=T&&!!w.clearcoatRoughnessMap,Ee=F&&!!w.iridescenceMap,ne=F&&!!w.iridescenceThicknessMap,fe=q&&!!w.sheenColorMap,De=q&&!!w.sheenRoughnessMap,Te=!!w.specularMap,he=!!w.specularColorMap,Ve=!!w.specularIntensityMap,D=K&&!!w.transmissionMap,ie=K&&!!w.thicknessMap,le=!!w.gradientMap,ye=!!w.alphaMap,Q=w.alphaTest>0,J=!!w.alphaHash,be=!!w.extensions,Fe=fi;w.toneMapped&&(Z===null||Z.isXRRenderTarget===!0)&&(Fe=n.toneMapping);let ft={shaderID:oe,shaderType:w.type,shaderName:w.name,vertexShader:rt,fragmentShader:Ue,defines:w.defines,customVertexShaderID:qe,customFragmentShaderID:$,isRawShaderMaterial:w.isRawShaderMaterial===!0,glslVersion:w.glslVersion,precision:d,batching:ue,batchingColor:ue&&W._colorsTexture!==null,instancing:ve,instancingColor:ve&&W.instanceColor!==null,instancingMorph:ve&&W.morphTexture!==null,supportsVertexTextures:f,outputColorSpace:Z===null?n.outputColorSpace:Z.isXRRenderTarget===!0?Z.texture.colorSpace:ui,alphaToCoverage:!!w.alphaToCoverage,map:Ze,matcap:Ct,envMap:C,envMapMode:C&&re.mapping,envMapCubeUVHeight:H,aoMap:dt,lightMap:Be,bumpMap:Ne,normalMap:_e,displacementMap:f&&yt,emissiveMap:Se,normalMapObjectSpace:_e&&w.normalMapType===up,normalMapTangentSpace:_e&&w.normalMapType===hp,metalnessMap:He,roughnessMap:Nt,anisotropy:Mt,anisotropyMap:G,clearcoat:T,clearcoatMap:Ae,clearcoatNormalMap:ae,clearcoatRoughnessMap:we,dispersion:x,iridescence:F,iridescenceMap:Ee,iridescenceThicknessMap:ne,sheen:q,sheenColorMap:fe,sheenRoughnessMap:De,specularMap:Te,specularColorMap:he,specularIntensityMap:Ve,transmission:K,transmissionMap:D,thicknessMap:ie,gradientMap:le,opaque:w.transparent===!1&&w.blending===lr&&w.alphaToCoverage===!1,alphaMap:ye,alphaTest:Q,alphaHash:J,combine:w.combine,mapUv:Ze&&y(w.map.channel),aoMapUv:dt&&y(w.aoMap.channel),lightMapUv:Be&&y(w.lightMap.channel),bumpMapUv:Ne&&y(w.bumpMap.channel),normalMapUv:_e&&y(w.normalMap.channel),displacementMapUv:yt&&y(w.displacementMap.channel),emissiveMapUv:Se&&y(w.emissiveMap.channel),metalnessMapUv:He&&y(w.metalnessMap.channel),roughnessMapUv:Nt&&y(w.roughnessMap.channel),anisotropyMapUv:G&&y(w.anisotropyMap.channel),clearcoatMapUv:Ae&&y(w.clearcoatMap.channel),clearcoatNormalMapUv:ae&&y(w.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:we&&y(w.clearcoatRoughnessMap.channel),iridescenceMapUv:Ee&&y(w.iridescenceMap.channel),iridescenceThicknessMapUv:ne&&y(w.iridescenceThicknessMap.channel),sheenColorMapUv:fe&&y(w.sheenColorMap.channel),sheenRoughnessMapUv:De&&y(w.sheenRoughnessMap.channel),specularMapUv:Te&&y(w.specularMap.channel),specularColorMapUv:he&&y(w.specularColorMap.channel),specularIntensityMapUv:Ve&&y(w.specularIntensityMap.channel),transmissionMapUv:D&&y(w.transmissionMap.channel),thicknessMapUv:ie&&y(w.thicknessMap.channel),alphaMapUv:ye&&y(w.alphaMap.channel),vertexTangents:!!j.attributes.tangent&&(_e||Mt),vertexColors:w.vertexColors,vertexAlphas:w.vertexColors===!0&&!!j.attributes.color&&j.attributes.color.itemSize===4,pointsUvs:W.isPoints===!0&&!!j.attributes.uv&&(Ze||ye),fog:!!Y,useFog:w.fog===!0,fogExp2:!!Y&&Y.isFogExp2,flatShading:w.flatShading===!0&&w.wireframe===!1,sizeAttenuation:w.sizeAttenuation===!0,logarithmicDepthBuffer:u,reversedDepthBuffer:me,skinning:W.isSkinnedMesh===!0,morphTargets:j.morphAttributes.position!==void 0,morphNormals:j.morphAttributes.normal!==void 0,morphColors:j.morphAttributes.color!==void 0,morphTargetsCount:Me,morphTextureStride:$e,numDirLights:M.directional.length,numPointLights:M.point.length,numSpotLights:M.spot.length,numSpotLightMaps:M.spotLightMap.length,numRectAreaLights:M.rectArea.length,numHemiLights:M.hemi.length,numDirLightShadows:M.directionalShadowMap.length,numPointLightShadows:M.pointShadowMap.length,numSpotLightShadows:M.spotShadowMap.length,numSpotLightShadowsWithMaps:M.numSpotLightShadowsWithMaps,numLightProbes:M.numLightProbes,numClippingPlanes:a.numPlanes,numClipIntersection:a.numIntersection,dithering:w.dithering,shadowMapEnabled:n.shadowMap.enabled&&L.length>0,shadowMapType:n.shadowMap.type,toneMapping:Fe,decodeVideoTexture:Ze&&w.map.isVideoTexture===!0&&Ke.getTransfer(w.map.colorSpace)===at,decodeVideoTextureEmissive:Se&&w.emissiveMap.isVideoTexture===!0&&Ke.getTransfer(w.emissiveMap.colorSpace)===at,premultipliedAlpha:w.premultipliedAlpha,doubleSided:w.side===An,flipSided:w.side===en,useDepthPacking:w.depthPacking>=0,depthPacking:w.depthPacking||0,index0AttributeName:w.index0AttributeName,extensionClipCullDistance:be&&w.extensions.clipCullDistance===!0&&i.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(be&&w.extensions.multiDraw===!0||ue)&&i.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:i.has("KHR_parallel_shader_compile"),customProgramCacheKey:w.customProgramCacheKey()};return ft.vertexUv1s=c.has(1),ft.vertexUv2s=c.has(2),ft.vertexUv3s=c.has(3),c.clear(),ft}function p(w){let M=[];if(w.shaderID?M.push(w.shaderID):(M.push(w.customVertexShaderID),M.push(w.customFragmentShaderID)),w.defines!==void 0)for(let L in w.defines)M.push(L),M.push(w.defines[L]);return w.isRawShaderMaterial===!1&&(b(M,w),_(M,w),M.push(n.outputColorSpace)),M.push(w.customProgramCacheKey),M.join()}function b(w,M){w.push(M.precision),w.push(M.outputColorSpace),w.push(M.envMapMode),w.push(M.envMapCubeUVHeight),w.push(M.mapUv),w.push(M.alphaMapUv),w.push(M.lightMapUv),w.push(M.aoMapUv),w.push(M.bumpMapUv),w.push(M.normalMapUv),w.push(M.displacementMapUv),w.push(M.emissiveMapUv),w.push(M.metalnessMapUv),w.push(M.roughnessMapUv),w.push(M.anisotropyMapUv),w.push(M.clearcoatMapUv),w.push(M.clearcoatNormalMapUv),w.push(M.clearcoatRoughnessMapUv),w.push(M.iridescenceMapUv),w.push(M.iridescenceThicknessMapUv),w.push(M.sheenColorMapUv),w.push(M.sheenRoughnessMapUv),w.push(M.specularMapUv),w.push(M.specularColorMapUv),w.push(M.specularIntensityMapUv),w.push(M.transmissionMapUv),w.push(M.thicknessMapUv),w.push(M.combine),w.push(M.fogExp2),w.push(M.sizeAttenuation),w.push(M.morphTargetsCount),w.push(M.morphAttributeCount),w.push(M.numDirLights),w.push(M.numPointLights),w.push(M.numSpotLights),w.push(M.numSpotLightMaps),w.push(M.numHemiLights),w.push(M.numRectAreaLights),w.push(M.numDirLightShadows),w.push(M.numPointLightShadows),w.push(M.numSpotLightShadows),w.push(M.numSpotLightShadowsWithMaps),w.push(M.numLightProbes),w.push(M.shadowMapType),w.push(M.toneMapping),w.push(M.numClippingPlanes),w.push(M.numClipIntersection),w.push(M.depthPacking)}function _(w,M){o.disableAll(),M.supportsVertexTextures&&o.enable(0),M.instancing&&o.enable(1),M.instancingColor&&o.enable(2),M.instancingMorph&&o.enable(3),M.matcap&&o.enable(4),M.envMap&&o.enable(5),M.normalMapObjectSpace&&o.enable(6),M.normalMapTangentSpace&&o.enable(7),M.clearcoat&&o.enable(8),M.iridescence&&o.enable(9),M.alphaTest&&o.enable(10),M.vertexColors&&o.enable(11),M.vertexAlphas&&o.enable(12),M.vertexUv1s&&o.enable(13),M.vertexUv2s&&o.enable(14),M.vertexUv3s&&o.enable(15),M.vertexTangents&&o.enable(16),M.anisotropy&&o.enable(17),M.alphaHash&&o.enable(18),M.batching&&o.enable(19),M.dispersion&&o.enable(20),M.batchingColor&&o.enable(21),M.gradientMap&&o.enable(22),w.push(o.mask),o.disableAll(),M.fog&&o.enable(0),M.useFog&&o.enable(1),M.flatShading&&o.enable(2),M.logarithmicDepthBuffer&&o.enable(3),M.reversedDepthBuffer&&o.enable(4),M.skinning&&o.enable(5),M.morphTargets&&o.enable(6),M.morphNormals&&o.enable(7),M.morphColors&&o.enable(8),M.premultipliedAlpha&&o.enable(9),M.shadowMapEnabled&&o.enable(10),M.doubleSided&&o.enable(11),M.flipSided&&o.enable(12),M.useDepthPacking&&o.enable(13),M.dithering&&o.enable(14),M.transmission&&o.enable(15),M.sheen&&o.enable(16),M.opaque&&o.enable(17),M.pointsUvs&&o.enable(18),M.decodeVideoTexture&&o.enable(19),M.decodeVideoTextureEmissive&&o.enable(20),M.alphaToCoverage&&o.enable(21),w.push(o.mask)}function v(w){let M=g[w.type],L;if(M){let V=Jn[M];L=Sp.clone(V.uniforms)}else L=w.uniforms;return L}function E(w,M){let L;for(let V=0,W=h.length;V<W;V++){let Y=h[V];if(Y.cacheKey===M){L=Y,++L.usedTimes;break}}return L===void 0&&(L=new F_(n,M,w,s),h.push(L)),L}function A(w){if(--w.usedTimes===0){let M=h.indexOf(w);h[M]=h[h.length-1],h.pop(),w.destroy()}}function P(w){l.remove(w)}function k(){l.dispose()}return{getParameters:m,getProgramCacheKey:p,getUniforms:v,acquireProgram:E,releaseProgram:A,releaseShaderCache:P,programs:h,dispose:k}}function V_(){let n=new WeakMap;function e(a){return n.has(a)}function t(a){let o=n.get(a);return o===void 0&&(o={},n.set(a,o)),o}function i(a){n.delete(a)}function r(a,o,l){n.get(a)[o]=l}function s(){n=new WeakMap}return{has:e,get:t,remove:i,update:r,dispose:s}}function H_(n,e){return n.groupOrder!==e.groupOrder?n.groupOrder-e.groupOrder:n.renderOrder!==e.renderOrder?n.renderOrder-e.renderOrder:n.material.id!==e.material.id?n.material.id-e.material.id:n.z!==e.z?n.z-e.z:n.id-e.id}function Wp(n,e){return n.groupOrder!==e.groupOrder?n.groupOrder-e.groupOrder:n.renderOrder!==e.renderOrder?n.renderOrder-e.renderOrder:n.z!==e.z?e.z-n.z:n.id-e.id}function $p(){let n=[],e=0,t=[],i=[],r=[];function s(){e=0,t.length=0,i.length=0,r.length=0}function a(u,f,d,g,y,m){let p=n[e];return p===void 0?(p={id:u.id,object:u,geometry:f,material:d,groupOrder:g,renderOrder:u.renderOrder,z:y,group:m},n[e]=p):(p.id=u.id,p.object=u,p.geometry=f,p.material=d,p.groupOrder=g,p.renderOrder=u.renderOrder,p.z=y,p.group=m),e++,p}function o(u,f,d,g,y,m){let p=a(u,f,d,g,y,m);d.transmission>0?i.push(p):d.transparent===!0?r.push(p):t.push(p)}function l(u,f,d,g,y,m){let p=a(u,f,d,g,y,m);d.transmission>0?i.unshift(p):d.transparent===!0?r.unshift(p):t.unshift(p)}function c(u,f){t.length>1&&t.sort(u||H_),i.length>1&&i.sort(f||Wp),r.length>1&&r.sort(f||Wp)}function h(){for(let u=e,f=n.length;u<f;u++){let d=n[u];if(d.id===null)break;d.id=null,d.object=null,d.geometry=null,d.material=null,d.group=null}}return{opaque:t,transmissive:i,transparent:r,init:s,push:o,unshift:l,finish:h,sort:c}}function G_(){let n=new WeakMap;function e(i,r){let s=n.get(i),a;return s===void 0?(a=new $p,n.set(i,[a])):r>=s.length?(a=new $p,s.push(a)):a=s[r],a}function t(){n=new WeakMap}return{get:e,dispose:t}}function W_(){let n={};return{get:function(e){if(n[e.id]!==void 0)return n[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new N,color:new Je};break;case"SpotLight":t={position:new N,direction:new N,color:new Je,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new N,color:new Je,distance:0,decay:0};break;case"HemisphereLight":t={direction:new N,skyColor:new Je,groundColor:new Je};break;case"RectAreaLight":t={color:new Je,position:new N,halfWidth:new N,halfHeight:new N};break}return n[e.id]=t,t}}}function $_(){let n={};return{get:function(e){if(n[e.id]!==void 0)return n[e.id];let t;switch(e.type){case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Le};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Le};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Le,shadowCameraNear:1,shadowCameraFar:1e3};break}return n[e.id]=t,t}}}var X_=0;function q_(n,e){return(e.castShadow?2:0)-(n.castShadow?2:0)+(e.map?1:0)-(n.map?1:0)}function Y_(n){let e=new W_,t=$_(),i={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)i.probe.push(new N);let r=new N,s=new bt,a=new bt;function o(c){let h=0,u=0,f=0;for(let w=0;w<9;w++)i.probe[w].set(0,0,0);let d=0,g=0,y=0,m=0,p=0,b=0,_=0,v=0,E=0,A=0,P=0;c.sort(q_);for(let w=0,M=c.length;w<M;w++){let L=c[w],V=L.color,W=L.intensity,Y=L.distance,j=L.shadow&&L.shadow.map?L.shadow.map.texture:null;if(L.isAmbientLight)h+=V.r*W,u+=V.g*W,f+=V.b*W;else if(L.isLightProbe){for(let X=0;X<9;X++)i.probe[X].addScaledVector(L.sh.coefficients[X],W);P++}else if(L.isDirectionalLight){let X=e.get(L);if(X.color.copy(L.color).multiplyScalar(L.intensity),L.castShadow){let re=L.shadow,H=t.get(L);H.shadowIntensity=re.intensity,H.shadowBias=re.bias,H.shadowNormalBias=re.normalBias,H.shadowRadius=re.radius,H.shadowMapSize=re.mapSize,i.directionalShadow[d]=H,i.directionalShadowMap[d]=j,i.directionalShadowMatrix[d]=L.shadow.matrix,b++}i.directional[d]=X,d++}else if(L.isSpotLight){let X=e.get(L);X.position.setFromMatrixPosition(L.matrixWorld),X.color.copy(V).multiplyScalar(W),X.distance=Y,X.coneCos=Math.cos(L.angle),X.penumbraCos=Math.cos(L.angle*(1-L.penumbra)),X.decay=L.decay,i.spot[y]=X;let re=L.shadow;if(L.map&&(i.spotLightMap[E]=L.map,E++,re.updateMatrices(L),L.castShadow&&A++),i.spotLightMatrix[y]=re.matrix,L.castShadow){let H=t.get(L);H.shadowIntensity=re.intensity,H.shadowBias=re.bias,H.shadowNormalBias=re.normalBias,H.shadowRadius=re.radius,H.shadowMapSize=re.mapSize,i.spotShadow[y]=H,i.spotShadowMap[y]=j,v++}y++}else if(L.isRectAreaLight){let X=e.get(L);X.color.copy(V).multiplyScalar(W),X.halfWidth.set(L.width*.5,0,0),X.halfHeight.set(0,L.height*.5,0),i.rectArea[m]=X,m++}else if(L.isPointLight){let X=e.get(L);if(X.color.copy(L.color).multiplyScalar(L.intensity),X.distance=L.distance,X.decay=L.decay,L.castShadow){let re=L.shadow,H=t.get(L);H.shadowIntensity=re.intensity,H.shadowBias=re.bias,H.shadowNormalBias=re.normalBias,H.shadowRadius=re.radius,H.shadowMapSize=re.mapSize,H.shadowCameraNear=re.camera.near,H.shadowCameraFar=re.camera.far,i.pointShadow[g]=H,i.pointShadowMap[g]=j,i.pointShadowMatrix[g]=L.shadow.matrix,_++}i.point[g]=X,g++}else if(L.isHemisphereLight){let X=e.get(L);X.skyColor.copy(L.color).multiplyScalar(W),X.groundColor.copy(L.groundColor).multiplyScalar(W),i.hemi[p]=X,p++}}m>0&&(n.has("OES_texture_float_linear")===!0?(i.rectAreaLTC1=ce.LTC_FLOAT_1,i.rectAreaLTC2=ce.LTC_FLOAT_2):(i.rectAreaLTC1=ce.LTC_HALF_1,i.rectAreaLTC2=ce.LTC_HALF_2)),i.ambient[0]=h,i.ambient[1]=u,i.ambient[2]=f;let k=i.hash;(k.directionalLength!==d||k.pointLength!==g||k.spotLength!==y||k.rectAreaLength!==m||k.hemiLength!==p||k.numDirectionalShadows!==b||k.numPointShadows!==_||k.numSpotShadows!==v||k.numSpotMaps!==E||k.numLightProbes!==P)&&(i.directional.length=d,i.spot.length=y,i.rectArea.length=m,i.point.length=g,i.hemi.length=p,i.directionalShadow.length=b,i.directionalShadowMap.length=b,i.pointShadow.length=_,i.pointShadowMap.length=_,i.spotShadow.length=v,i.spotShadowMap.length=v,i.directionalShadowMatrix.length=b,i.pointShadowMatrix.length=_,i.spotLightMatrix.length=v+E-A,i.spotLightMap.length=E,i.numSpotLightShadowsWithMaps=A,i.numLightProbes=P,k.directionalLength=d,k.pointLength=g,k.spotLength=y,k.rectAreaLength=m,k.hemiLength=p,k.numDirectionalShadows=b,k.numPointShadows=_,k.numSpotShadows=v,k.numSpotMaps=E,k.numLightProbes=P,i.version=X_++)}function l(c,h){let u=0,f=0,d=0,g=0,y=0,m=h.matrixWorldInverse;for(let p=0,b=c.length;p<b;p++){let _=c[p];if(_.isDirectionalLight){let v=i.directional[u];v.direction.setFromMatrixPosition(_.matrixWorld),r.setFromMatrixPosition(_.target.matrixWorld),v.direction.sub(r),v.direction.transformDirection(m),u++}else if(_.isSpotLight){let v=i.spot[d];v.position.setFromMatrixPosition(_.matrixWorld),v.position.applyMatrix4(m),v.direction.setFromMatrixPosition(_.matrixWorld),r.setFromMatrixPosition(_.target.matrixWorld),v.direction.sub(r),v.direction.transformDirection(m),d++}else if(_.isRectAreaLight){let v=i.rectArea[g];v.position.setFromMatrixPosition(_.matrixWorld),v.position.applyMatrix4(m),a.identity(),s.copy(_.matrixWorld),s.premultiply(m),a.extractRotation(s),v.halfWidth.set(_.width*.5,0,0),v.halfHeight.set(0,_.height*.5,0),v.halfWidth.applyMatrix4(a),v.halfHeight.applyMatrix4(a),g++}else if(_.isPointLight){let v=i.point[f];v.position.setFromMatrixPosition(_.matrixWorld),v.position.applyMatrix4(m),f++}else if(_.isHemisphereLight){let v=i.hemi[y];v.direction.setFromMatrixPosition(_.matrixWorld),v.direction.transformDirection(m),y++}}}return{setup:o,setupView:l,state:i}}function Xp(n){let e=new Y_(n),t=[],i=[];function r(h){c.camera=h,t.length=0,i.length=0}function s(h){t.push(h)}function a(h){i.push(h)}function o(){e.setup(t)}function l(h){e.setupView(t,h)}let c={lightsArray:t,shadowsArray:i,camera:null,lights:e,transmissionRenderTarget:{}};return{init:r,state:c,setupLights:o,setupLightsView:l,pushLight:s,pushShadow:a}}function j_(n){let e=new WeakMap;function t(r,s=0){let a=e.get(r),o;return a===void 0?(o=new Xp(n),e.set(r,[o])):s>=a.length?(o=new Xp(n),a.push(o)):o=a[s],o}function i(){e=new WeakMap}return{get:t,dispose:i}}var J_=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,Z_=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`;function K_(n,e,t){let i=new la,r=new Le,s=new Le,a=new ut,o=new Ko({depthPacking:cp}),l=new Qo,c={},h=t.maxTextureSize,u={[hi]:en,[en]:hi,[An]:An},f=new an({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Le},radius:{value:4}},vertexShader:J_,fragmentShader:Z_}),d=f.clone();d.defines.HORIZONTAL_PASS=1;let g=new wt;g.setAttribute("position",new St(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let y=new It(g,f),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Wh;let p=this.type;this.render=function(A,P,k){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||A.length===0)return;let w=n.getRenderTarget(),M=n.getActiveCubeFace(),L=n.getActiveMipmapLevel(),V=n.state;V.setBlending(Bn),V.buffers.depth.getReversed()===!0?V.buffers.color.setClear(0,0,0,0):V.buffers.color.setClear(1,1,1,1),V.buffers.depth.setTest(!0),V.setScissorTest(!1);let W=p!==Yn&&this.type===Yn,Y=p===Yn&&this.type!==Yn;for(let j=0,X=A.length;j<X;j++){let re=A[j],H=re.shadow;if(H===void 0){console.warn("THREE.WebGLShadowMap:",re,"has no shadow.");continue}if(H.autoUpdate===!1&&H.needsUpdate===!1)continue;r.copy(H.mapSize);let oe=H.getFrameExtents();if(r.multiply(oe),s.copy(H.mapSize),(r.x>h||r.y>h)&&(r.x>h&&(s.x=Math.floor(h/oe.x),r.x=s.x*oe.x,H.mapSize.x=s.x),r.y>h&&(s.y=Math.floor(h/oe.y),r.y=s.y*oe.y,H.mapSize.y=s.y)),H.map===null||W===!0||Y===!0){let Me=this.type!==Yn?{minFilter:Vt,magFilter:Vt}:{};H.map!==null&&H.map.dispose(),H.map=new En(r.x,r.y,Me),H.map.texture.name=re.name+".shadowMap",H.camera.updateProjectionMatrix()}n.setRenderTarget(H.map),n.clear();let ee=H.getViewportCount();for(let Me=0;Me<ee;Me++){let $e=H.getViewport(Me);a.set(s.x*$e.x,s.y*$e.y,s.x*$e.z,s.y*$e.w),V.viewport(a),H.updateMatrices(re,Me),i=H.getFrustum(),v(P,k,H.camera,re,this.type)}H.isPointLightShadow!==!0&&this.type===Yn&&b(H,k),H.needsUpdate=!1}p=this.type,m.needsUpdate=!1,n.setRenderTarget(w,M,L)};function b(A,P){let k=e.update(y);f.defines.VSM_SAMPLES!==A.blurSamples&&(f.defines.VSM_SAMPLES=A.blurSamples,d.defines.VSM_SAMPLES=A.blurSamples,f.needsUpdate=!0,d.needsUpdate=!0),A.mapPass===null&&(A.mapPass=new En(r.x,r.y)),f.uniforms.shadow_pass.value=A.map.texture,f.uniforms.resolution.value=A.mapSize,f.uniforms.radius.value=A.radius,n.setRenderTarget(A.mapPass),n.clear(),n.renderBufferDirect(P,null,k,f,y,null),d.uniforms.shadow_pass.value=A.mapPass.texture,d.uniforms.resolution.value=A.mapSize,d.uniforms.radius.value=A.radius,n.setRenderTarget(A.map),n.clear(),n.renderBufferDirect(P,null,k,d,y,null)}function _(A,P,k,w){let M=null,L=k.isPointLight===!0?A.customDistanceMaterial:A.customDepthMaterial;if(L!==void 0)M=L;else if(M=k.isPointLight===!0?l:o,n.localClippingEnabled&&P.clipShadows===!0&&Array.isArray(P.clippingPlanes)&&P.clippingPlanes.length!==0||P.displacementMap&&P.displacementScale!==0||P.alphaMap&&P.alphaTest>0||P.map&&P.alphaTest>0||P.alphaToCoverage===!0){let V=M.uuid,W=P.uuid,Y=c[V];Y===void 0&&(Y={},c[V]=Y);let j=Y[W];j===void 0&&(j=M.clone(),Y[W]=j,P.addEventListener("dispose",E)),M=j}if(M.visible=P.visible,M.wireframe=P.wireframe,w===Yn?M.side=P.shadowSide!==null?P.shadowSide:P.side:M.side=P.shadowSide!==null?P.shadowSide:u[P.side],M.alphaMap=P.alphaMap,M.alphaTest=P.alphaToCoverage===!0?.5:P.alphaTest,M.map=P.map,M.clipShadows=P.clipShadows,M.clippingPlanes=P.clippingPlanes,M.clipIntersection=P.clipIntersection,M.displacementMap=P.displacementMap,M.displacementScale=P.displacementScale,M.displacementBias=P.displacementBias,M.wireframeLinewidth=P.wireframeLinewidth,M.linewidth=P.linewidth,k.isPointLight===!0&&M.isMeshDistanceMaterial===!0){let V=n.properties.get(M);V.light=k}return M}function v(A,P,k,w,M){if(A.visible===!1)return;if(A.layers.test(P.layers)&&(A.isMesh||A.isLine||A.isPoints)&&(A.castShadow||A.receiveShadow&&M===Yn)&&(!A.frustumCulled||i.intersectsObject(A))){A.modelViewMatrix.multiplyMatrices(k.matrixWorldInverse,A.matrixWorld);let W=e.update(A),Y=A.material;if(Array.isArray(Y)){let j=W.groups;for(let X=0,re=j.length;X<re;X++){let H=j[X],oe=Y[H.materialIndex];if(oe&&oe.visible){let ee=_(A,oe,w,M);A.onBeforeShadow(n,A,P,k,W,ee,H),n.renderBufferDirect(k,null,W,ee,A,H),A.onAfterShadow(n,A,P,k,W,ee,H)}}}else if(Y.visible){let j=_(A,Y,w,M);A.onBeforeShadow(n,A,P,k,W,j,null),n.renderBufferDirect(k,null,W,j,A,null),A.onAfterShadow(n,A,P,k,W,j,null)}}let V=A.children;for(let W=0,Y=V.length;W<Y;W++)v(V[W],P,k,w,M)}function E(A){A.target.removeEventListener("dispose",E);for(let k in c){let w=c[k],M=A.target.uuid;M in w&&(w[M].dispose(),delete w[M])}}}var Q_={[hl]:ul,[dl]:ml,[fl]:gl,[cr]:pl,[ul]:hl,[ml]:dl,[gl]:fl,[pl]:cr};function eS(n,e){function t(){let D=!1,ie=new ut,le=null,ye=new ut(0,0,0,0);return{setMask:function(Q){le!==Q&&!D&&(n.colorMask(Q,Q,Q,Q),le=Q)},setLocked:function(Q){D=Q},setClear:function(Q,J,be,Fe,ft){ft===!0&&(Q*=Fe,J*=Fe,be*=Fe),ie.set(Q,J,be,Fe),ye.equals(ie)===!1&&(n.clearColor(Q,J,be,Fe),ye.copy(ie))},reset:function(){D=!1,le=null,ye.set(-1,0,0,0)}}}function i(){let D=!1,ie=!1,le=null,ye=null,Q=null;return{setReversed:function(J){if(ie!==J){let be=e.get("EXT_clip_control");J?be.clipControlEXT(be.LOWER_LEFT_EXT,be.ZERO_TO_ONE_EXT):be.clipControlEXT(be.LOWER_LEFT_EXT,be.NEGATIVE_ONE_TO_ONE_EXT),ie=J;let Fe=Q;Q=null,this.setClear(Fe)}},getReversed:function(){return ie},setTest:function(J){J?Z(n.DEPTH_TEST):me(n.DEPTH_TEST)},setMask:function(J){le!==J&&!D&&(n.depthMask(J),le=J)},setFunc:function(J){if(ie&&(J=Q_[J]),ye!==J){switch(J){case hl:n.depthFunc(n.NEVER);break;case ul:n.depthFunc(n.ALWAYS);break;case dl:n.depthFunc(n.LESS);break;case cr:n.depthFunc(n.LEQUAL);break;case fl:n.depthFunc(n.EQUAL);break;case pl:n.depthFunc(n.GEQUAL);break;case ml:n.depthFunc(n.GREATER);break;case gl:n.depthFunc(n.NOTEQUAL);break;default:n.depthFunc(n.LEQUAL)}ye=J}},setLocked:function(J){D=J},setClear:function(J){Q!==J&&(ie&&(J=1-J),n.clearDepth(J),Q=J)},reset:function(){D=!1,le=null,ye=null,Q=null,ie=!1}}}function r(){let D=!1,ie=null,le=null,ye=null,Q=null,J=null,be=null,Fe=null,ft=null;return{setTest:function(nt){D||(nt?Z(n.STENCIL_TEST):me(n.STENCIL_TEST))},setMask:function(nt){ie!==nt&&!D&&(n.stencilMask(nt),ie=nt)},setFunc:function(nt,Qn,Vn){(le!==nt||ye!==Qn||Q!==Vn)&&(n.stencilFunc(nt,Qn,Vn),le=nt,ye=Qn,Q=Vn)},setOp:function(nt,Qn,Vn){(J!==nt||be!==Qn||Fe!==Vn)&&(n.stencilOp(nt,Qn,Vn),J=nt,be=Qn,Fe=Vn)},setLocked:function(nt){D=nt},setClear:function(nt){ft!==nt&&(n.clearStencil(nt),ft=nt)},reset:function(){D=!1,ie=null,le=null,ye=null,Q=null,J=null,be=null,Fe=null,ft=null}}}let s=new t,a=new i,o=new r,l=new WeakMap,c=new WeakMap,h={},u={},f=new WeakMap,d=[],g=null,y=!1,m=null,p=null,b=null,_=null,v=null,E=null,A=null,P=new Je(0,0,0),k=0,w=!1,M=null,L=null,V=null,W=null,Y=null,j=n.getParameter(n.MAX_COMBINED_TEXTURE_IMAGE_UNITS),X=!1,re=0,H=n.getParameter(n.VERSION);H.indexOf("WebGL")!==-1?(re=parseFloat(/^WebGL (\d)/.exec(H)[1]),X=re>=1):H.indexOf("OpenGL ES")!==-1&&(re=parseFloat(/^OpenGL ES (\d)/.exec(H)[1]),X=re>=2);let oe=null,ee={},Me=n.getParameter(n.SCISSOR_BOX),$e=n.getParameter(n.VIEWPORT),rt=new ut().fromArray(Me),Ue=new ut().fromArray($e);function qe(D,ie,le,ye){let Q=new Uint8Array(4),J=n.createTexture();n.bindTexture(D,J),n.texParameteri(D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(D,n.TEXTURE_MAG_FILTER,n.NEAREST);for(let be=0;be<le;be++)D===n.TEXTURE_3D||D===n.TEXTURE_2D_ARRAY?n.texImage3D(ie,0,n.RGBA,1,1,ye,0,n.RGBA,n.UNSIGNED_BYTE,Q):n.texImage2D(ie+be,0,n.RGBA,1,1,0,n.RGBA,n.UNSIGNED_BYTE,Q);return J}let $={};$[n.TEXTURE_2D]=qe(n.TEXTURE_2D,n.TEXTURE_2D,1),$[n.TEXTURE_CUBE_MAP]=qe(n.TEXTURE_CUBE_MAP,n.TEXTURE_CUBE_MAP_POSITIVE_X,6),$[n.TEXTURE_2D_ARRAY]=qe(n.TEXTURE_2D_ARRAY,n.TEXTURE_2D_ARRAY,1,1),$[n.TEXTURE_3D]=qe(n.TEXTURE_3D,n.TEXTURE_3D,1,1),s.setClear(0,0,0,1),a.setClear(1),o.setClear(0),Z(n.DEPTH_TEST),a.setFunc(cr),Ne(!1),_e(Gh),Z(n.CULL_FACE),dt(Bn);function Z(D){h[D]!==!0&&(n.enable(D),h[D]=!0)}function me(D){h[D]!==!1&&(n.disable(D),h[D]=!1)}function ve(D,ie){return u[D]!==ie?(n.bindFramebuffer(D,ie),u[D]=ie,D===n.DRAW_FRAMEBUFFER&&(u[n.FRAMEBUFFER]=ie),D===n.FRAMEBUFFER&&(u[n.DRAW_FRAMEBUFFER]=ie),!0):!1}function ue(D,ie){let le=d,ye=!1;if(D){le=f.get(ie),le===void 0&&(le=[],f.set(ie,le));let Q=D.textures;if(le.length!==Q.length||le[0]!==n.COLOR_ATTACHMENT0){for(let J=0,be=Q.length;J<be;J++)le[J]=n.COLOR_ATTACHMENT0+J;le.length=Q.length,ye=!0}}else le[0]!==n.BACK&&(le[0]=n.BACK,ye=!0);ye&&n.drawBuffers(le)}function Ze(D){return g!==D?(n.useProgram(D),g=D,!0):!1}let Ct={[Ii]:n.FUNC_ADD,[Nf]:n.FUNC_SUBTRACT,[Of]:n.FUNC_REVERSE_SUBTRACT};Ct[Uf]=n.MIN,Ct[Ff]=n.MAX;let C={[Bf]:n.ZERO,[zf]:n.ONE,[Vf]:n.SRC_COLOR,[Fo]:n.SRC_ALPHA,[qf]:n.SRC_ALPHA_SATURATE,[$f]:n.DST_COLOR,[Gf]:n.DST_ALPHA,[Hf]:n.ONE_MINUS_SRC_COLOR,[Bo]:n.ONE_MINUS_SRC_ALPHA,[Xf]:n.ONE_MINUS_DST_COLOR,[Wf]:n.ONE_MINUS_DST_ALPHA,[Yf]:n.CONSTANT_COLOR,[jf]:n.ONE_MINUS_CONSTANT_COLOR,[Jf]:n.CONSTANT_ALPHA,[Zf]:n.ONE_MINUS_CONSTANT_ALPHA};function dt(D,ie,le,ye,Q,J,be,Fe,ft,nt){if(D===Bn){y===!0&&(me(n.BLEND),y=!1);return}if(y===!1&&(Z(n.BLEND),y=!0),D!==kf){if(D!==m||nt!==w){if((p!==Ii||v!==Ii)&&(n.blendEquation(n.FUNC_ADD),p=Ii,v=Ii),nt)switch(D){case lr:n.blendFuncSeparate(n.ONE,n.ONE_MINUS_SRC_ALPHA,n.ONE,n.ONE_MINUS_SRC_ALPHA);break;case $h:n.blendFunc(n.ONE,n.ONE);break;case Xh:n.blendFuncSeparate(n.ZERO,n.ONE_MINUS_SRC_COLOR,n.ZERO,n.ONE);break;case qh:n.blendFuncSeparate(n.DST_COLOR,n.ONE_MINUS_SRC_ALPHA,n.ZERO,n.ONE);break;default:console.error("THREE.WebGLState: Invalid blending: ",D);break}else switch(D){case lr:n.blendFuncSeparate(n.SRC_ALPHA,n.ONE_MINUS_SRC_ALPHA,n.ONE,n.ONE_MINUS_SRC_ALPHA);break;case $h:n.blendFuncSeparate(n.SRC_ALPHA,n.ONE,n.ONE,n.ONE);break;case Xh:console.error("THREE.WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case qh:console.error("THREE.WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:console.error("THREE.WebGLState: Invalid blending: ",D);break}b=null,_=null,E=null,A=null,P.set(0,0,0),k=0,m=D,w=nt}return}Q=Q||ie,J=J||le,be=be||ye,(ie!==p||Q!==v)&&(n.blendEquationSeparate(Ct[ie],Ct[Q]),p=ie,v=Q),(le!==b||ye!==_||J!==E||be!==A)&&(n.blendFuncSeparate(C[le],C[ye],C[J],C[be]),b=le,_=ye,E=J,A=be),(Fe.equals(P)===!1||ft!==k)&&(n.blendColor(Fe.r,Fe.g,Fe.b,ft),P.copy(Fe),k=ft),m=D,w=!1}function Be(D,ie){D.side===An?me(n.CULL_FACE):Z(n.CULL_FACE);let le=D.side===en;ie&&(le=!le),Ne(le),D.blending===lr&&D.transparent===!1?dt(Bn):dt(D.blending,D.blendEquation,D.blendSrc,D.blendDst,D.blendEquationAlpha,D.blendSrcAlpha,D.blendDstAlpha,D.blendColor,D.blendAlpha,D.premultipliedAlpha),a.setFunc(D.depthFunc),a.setTest(D.depthTest),a.setMask(D.depthWrite),s.setMask(D.colorWrite);let ye=D.stencilWrite;o.setTest(ye),ye&&(o.setMask(D.stencilWriteMask),o.setFunc(D.stencilFunc,D.stencilRef,D.stencilFuncMask),o.setOp(D.stencilFail,D.stencilZFail,D.stencilZPass)),Se(D.polygonOffset,D.polygonOffsetFactor,D.polygonOffsetUnits),D.alphaToCoverage===!0?Z(n.SAMPLE_ALPHA_TO_COVERAGE):me(n.SAMPLE_ALPHA_TO_COVERAGE)}function Ne(D){M!==D&&(D?n.frontFace(n.CW):n.frontFace(n.CCW),M=D)}function _e(D){D!==If?(Z(n.CULL_FACE),D!==L&&(D===Gh?n.cullFace(n.BACK):D===Lf?n.cullFace(n.FRONT):n.cullFace(n.FRONT_AND_BACK))):me(n.CULL_FACE),L=D}function yt(D){D!==V&&(X&&n.lineWidth(D),V=D)}function Se(D,ie,le){D?(Z(n.POLYGON_OFFSET_FILL),(W!==ie||Y!==le)&&(n.polygonOffset(ie,le),W=ie,Y=le)):me(n.POLYGON_OFFSET_FILL)}function He(D){D?Z(n.SCISSOR_TEST):me(n.SCISSOR_TEST)}function Nt(D){D===void 0&&(D=n.TEXTURE0+j-1),oe!==D&&(n.activeTexture(D),oe=D)}function Mt(D,ie,le){le===void 0&&(oe===null?le=n.TEXTURE0+j-1:le=oe);let ye=ee[le];ye===void 0&&(ye={type:void 0,texture:void 0},ee[le]=ye),(ye.type!==D||ye.texture!==ie)&&(oe!==le&&(n.activeTexture(le),oe=le),n.bindTexture(D,ie||$[D]),ye.type=D,ye.texture=ie)}function T(){let D=ee[oe];D!==void 0&&D.type!==void 0&&(n.bindTexture(D.type,null),D.type=void 0,D.texture=void 0)}function x(){try{n.compressedTexImage2D(...arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function F(){try{n.compressedTexImage3D(...arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function q(){try{n.texSubImage2D(...arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function K(){try{n.texSubImage3D(...arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function G(){try{n.compressedTexSubImage2D(...arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function Ae(){try{n.compressedTexSubImage3D(...arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function ae(){try{n.texStorage2D(...arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function we(){try{n.texStorage3D(...arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function Ee(){try{n.texImage2D(...arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function ne(){try{n.texImage3D(...arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function fe(D){rt.equals(D)===!1&&(n.scissor(D.x,D.y,D.z,D.w),rt.copy(D))}function De(D){Ue.equals(D)===!1&&(n.viewport(D.x,D.y,D.z,D.w),Ue.copy(D))}function Te(D,ie){let le=c.get(ie);le===void 0&&(le=new WeakMap,c.set(ie,le));let ye=le.get(D);ye===void 0&&(ye=n.getUniformBlockIndex(ie,D.name),le.set(D,ye))}function he(D,ie){let ye=c.get(ie).get(D);l.get(ie)!==ye&&(n.uniformBlockBinding(ie,ye,D.__bindingPointIndex),l.set(ie,ye))}function Ve(){n.disable(n.BLEND),n.disable(n.CULL_FACE),n.disable(n.DEPTH_TEST),n.disable(n.POLYGON_OFFSET_FILL),n.disable(n.SCISSOR_TEST),n.disable(n.STENCIL_TEST),n.disable(n.SAMPLE_ALPHA_TO_COVERAGE),n.blendEquation(n.FUNC_ADD),n.blendFunc(n.ONE,n.ZERO),n.blendFuncSeparate(n.ONE,n.ZERO,n.ONE,n.ZERO),n.blendColor(0,0,0,0),n.colorMask(!0,!0,!0,!0),n.clearColor(0,0,0,0),n.depthMask(!0),n.depthFunc(n.LESS),a.setReversed(!1),n.clearDepth(1),n.stencilMask(4294967295),n.stencilFunc(n.ALWAYS,0,4294967295),n.stencilOp(n.KEEP,n.KEEP,n.KEEP),n.clearStencil(0),n.cullFace(n.BACK),n.frontFace(n.CCW),n.polygonOffset(0,0),n.activeTexture(n.TEXTURE0),n.bindFramebuffer(n.FRAMEBUFFER,null),n.bindFramebuffer(n.DRAW_FRAMEBUFFER,null),n.bindFramebuffer(n.READ_FRAMEBUFFER,null),n.useProgram(null),n.lineWidth(1),n.scissor(0,0,n.canvas.width,n.canvas.height),n.viewport(0,0,n.canvas.width,n.canvas.height),h={},oe=null,ee={},u={},f=new WeakMap,d=[],g=null,y=!1,m=null,p=null,b=null,_=null,v=null,E=null,A=null,P=new Je(0,0,0),k=0,w=!1,M=null,L=null,V=null,W=null,Y=null,rt.set(0,0,n.canvas.width,n.canvas.height),Ue.set(0,0,n.canvas.width,n.canvas.height),s.reset(),a.reset(),o.reset()}return{buffers:{color:s,depth:a,stencil:o},enable:Z,disable:me,bindFramebuffer:ve,drawBuffers:ue,useProgram:Ze,setBlending:dt,setMaterial:Be,setFlipSided:Ne,setCullFace:_e,setLineWidth:yt,setPolygonOffset:Se,setScissorTest:He,activeTexture:Nt,bindTexture:Mt,unbindTexture:T,compressedTexImage2D:x,compressedTexImage3D:F,texImage2D:Ee,texImage3D:ne,updateUBOMapping:Te,uniformBlockBinding:he,texStorage2D:ae,texStorage3D:we,texSubImage2D:q,texSubImage3D:K,compressedTexSubImage2D:G,compressedTexSubImage3D:Ae,scissor:fe,viewport:De,reset:Ve}}function tS(n,e,t,i,r,s,a){let o=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new Le,h=new WeakMap,u,f=new WeakMap,d=!1;try{d=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(T,x){return d?new OffscreenCanvas(T,x):Qs("canvas")}function y(T,x,F){let q=1,K=Mt(T);if((K.width>F||K.height>F)&&(q=F/Math.max(K.width,K.height)),q<1)if(typeof HTMLImageElement<"u"&&T instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&T instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&T instanceof ImageBitmap||typeof VideoFrame<"u"&&T instanceof VideoFrame){let G=Math.floor(q*K.width),Ae=Math.floor(q*K.height);u===void 0&&(u=g(G,Ae));let ae=x?g(G,Ae):u;return ae.width=G,ae.height=Ae,ae.getContext("2d").drawImage(T,0,0,G,Ae),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+K.width+"x"+K.height+") to ("+G+"x"+Ae+")."),ae}else return"data"in T&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+K.width+"x"+K.height+")."),T;return T}function m(T){return T.generateMipmaps}function p(T){n.generateMipmap(T)}function b(T){return T.isWebGLCubeRenderTarget?n.TEXTURE_CUBE_MAP:T.isWebGL3DRenderTarget?n.TEXTURE_3D:T.isWebGLArrayRenderTarget||T.isCompressedArrayTexture?n.TEXTURE_2D_ARRAY:n.TEXTURE_2D}function _(T,x,F,q,K=!1){if(T!==null){if(n[T]!==void 0)return n[T];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+T+"'")}let G=x;if(x===n.RED&&(F===n.FLOAT&&(G=n.R32F),F===n.HALF_FLOAT&&(G=n.R16F),F===n.UNSIGNED_BYTE&&(G=n.R8)),x===n.RED_INTEGER&&(F===n.UNSIGNED_BYTE&&(G=n.R8UI),F===n.UNSIGNED_SHORT&&(G=n.R16UI),F===n.UNSIGNED_INT&&(G=n.R32UI),F===n.BYTE&&(G=n.R8I),F===n.SHORT&&(G=n.R16I),F===n.INT&&(G=n.R32I)),x===n.RG&&(F===n.FLOAT&&(G=n.RG32F),F===n.HALF_FLOAT&&(G=n.RG16F),F===n.UNSIGNED_BYTE&&(G=n.RG8)),x===n.RG_INTEGER&&(F===n.UNSIGNED_BYTE&&(G=n.RG8UI),F===n.UNSIGNED_SHORT&&(G=n.RG16UI),F===n.UNSIGNED_INT&&(G=n.RG32UI),F===n.BYTE&&(G=n.RG8I),F===n.SHORT&&(G=n.RG16I),F===n.INT&&(G=n.RG32I)),x===n.RGB_INTEGER&&(F===n.UNSIGNED_BYTE&&(G=n.RGB8UI),F===n.UNSIGNED_SHORT&&(G=n.RGB16UI),F===n.UNSIGNED_INT&&(G=n.RGB32UI),F===n.BYTE&&(G=n.RGB8I),F===n.SHORT&&(G=n.RGB16I),F===n.INT&&(G=n.RGB32I)),x===n.RGBA_INTEGER&&(F===n.UNSIGNED_BYTE&&(G=n.RGBA8UI),F===n.UNSIGNED_SHORT&&(G=n.RGBA16UI),F===n.UNSIGNED_INT&&(G=n.RGBA32UI),F===n.BYTE&&(G=n.RGBA8I),F===n.SHORT&&(G=n.RGBA16I),F===n.INT&&(G=n.RGBA32I)),x===n.RGB&&(F===n.UNSIGNED_INT_5_9_9_9_REV&&(G=n.RGB9_E5),F===n.UNSIGNED_INT_10F_11F_11F_REV&&(G=n.R11F_G11F_B10F)),x===n.RGBA){let Ae=K?Zs:Ke.getTransfer(q);F===n.FLOAT&&(G=n.RGBA32F),F===n.HALF_FLOAT&&(G=n.RGBA16F),F===n.UNSIGNED_BYTE&&(G=Ae===at?n.SRGB8_ALPHA8:n.RGBA8),F===n.UNSIGNED_SHORT_4_4_4_4&&(G=n.RGBA4),F===n.UNSIGNED_SHORT_5_5_5_1&&(G=n.RGB5_A1)}return(G===n.R16F||G===n.R32F||G===n.RG16F||G===n.RG32F||G===n.RGBA16F||G===n.RGBA32F)&&e.get("EXT_color_buffer_float"),G}function v(T,x){let F;return T?x===null||x===Fi||x===hs?F=n.DEPTH24_STENCIL8:x===Cn?F=n.DEPTH32F_STENCIL8:x===ls&&(F=n.DEPTH24_STENCIL8,console.warn("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):x===null||x===Fi||x===hs?F=n.DEPTH_COMPONENT24:x===Cn?F=n.DEPTH_COMPONENT32F:x===ls&&(F=n.DEPTH_COMPONENT16),F}function E(T,x){return m(T)===!0||T.isFramebufferTexture&&T.minFilter!==Vt&&T.minFilter!==Nn?Math.log2(Math.max(x.width,x.height))+1:T.mipmaps!==void 0&&T.mipmaps.length>0?T.mipmaps.length:T.isCompressedTexture&&Array.isArray(T.image)?x.mipmaps.length:1}function A(T){let x=T.target;x.removeEventListener("dispose",A),k(x),x.isVideoTexture&&h.delete(x)}function P(T){let x=T.target;x.removeEventListener("dispose",P),M(x)}function k(T){let x=i.get(T);if(x.__webglInit===void 0)return;let F=T.source,q=f.get(F);if(q){let K=q[x.__cacheKey];K.usedTimes--,K.usedTimes===0&&w(T),Object.keys(q).length===0&&f.delete(F)}i.remove(T)}function w(T){let x=i.get(T);n.deleteTexture(x.__webglTexture);let F=T.source,q=f.get(F);delete q[x.__cacheKey],a.memory.textures--}function M(T){let x=i.get(T);if(T.depthTexture&&(T.depthTexture.dispose(),i.remove(T.depthTexture)),T.isWebGLCubeRenderTarget)for(let q=0;q<6;q++){if(Array.isArray(x.__webglFramebuffer[q]))for(let K=0;K<x.__webglFramebuffer[q].length;K++)n.deleteFramebuffer(x.__webglFramebuffer[q][K]);else n.deleteFramebuffer(x.__webglFramebuffer[q]);x.__webglDepthbuffer&&n.deleteRenderbuffer(x.__webglDepthbuffer[q])}else{if(Array.isArray(x.__webglFramebuffer))for(let q=0;q<x.__webglFramebuffer.length;q++)n.deleteFramebuffer(x.__webglFramebuffer[q]);else n.deleteFramebuffer(x.__webglFramebuffer);if(x.__webglDepthbuffer&&n.deleteRenderbuffer(x.__webglDepthbuffer),x.__webglMultisampledFramebuffer&&n.deleteFramebuffer(x.__webglMultisampledFramebuffer),x.__webglColorRenderbuffer)for(let q=0;q<x.__webglColorRenderbuffer.length;q++)x.__webglColorRenderbuffer[q]&&n.deleteRenderbuffer(x.__webglColorRenderbuffer[q]);x.__webglDepthRenderbuffer&&n.deleteRenderbuffer(x.__webglDepthRenderbuffer)}let F=T.textures;for(let q=0,K=F.length;q<K;q++){let G=i.get(F[q]);G.__webglTexture&&(n.deleteTexture(G.__webglTexture),a.memory.textures--),i.remove(F[q])}i.remove(T)}let L=0;function V(){L=0}function W(){let T=L;return T>=r.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+T+" texture units while this GPU supports only "+r.maxTextures),L+=1,T}function Y(T){let x=[];return x.push(T.wrapS),x.push(T.wrapT),x.push(T.wrapR||0),x.push(T.magFilter),x.push(T.minFilter),x.push(T.anisotropy),x.push(T.internalFormat),x.push(T.format),x.push(T.type),x.push(T.generateMipmaps),x.push(T.premultiplyAlpha),x.push(T.flipY),x.push(T.unpackAlignment),x.push(T.colorSpace),x.join()}function j(T,x){let F=i.get(T);if(T.isVideoTexture&&He(T),T.isRenderTargetTexture===!1&&T.isExternalTexture!==!0&&T.version>0&&F.__version!==T.version){let q=T.image;if(q===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(q.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{$(F,T,x);return}}else T.isExternalTexture&&(F.__webglTexture=T.sourceTexture?T.sourceTexture:null);t.bindTexture(n.TEXTURE_2D,F.__webglTexture,n.TEXTURE0+x)}function X(T,x){let F=i.get(T);if(T.isRenderTargetTexture===!1&&T.version>0&&F.__version!==T.version){$(F,T,x);return}t.bindTexture(n.TEXTURE_2D_ARRAY,F.__webglTexture,n.TEXTURE0+x)}function re(T,x){let F=i.get(T);if(T.isRenderTargetTexture===!1&&T.version>0&&F.__version!==T.version){$(F,T,x);return}t.bindTexture(n.TEXTURE_3D,F.__webglTexture,n.TEXTURE0+x)}function H(T,x){let F=i.get(T);if(T.version>0&&F.__version!==T.version){Z(F,T,x);return}t.bindTexture(n.TEXTURE_CUBE_MAP,F.__webglTexture,n.TEXTURE0+x)}let oe={[zo]:n.REPEAT,[Pi]:n.CLAMP_TO_EDGE,[Vo]:n.MIRRORED_REPEAT},ee={[Vt]:n.NEAREST,[op]:n.NEAREST_MIPMAP_NEAREST,[ga]:n.NEAREST_MIPMAP_LINEAR,[Nn]:n.LINEAR,[xl]:n.LINEAR_MIPMAP_NEAREST,[Ui]:n.LINEAR_MIPMAP_LINEAR},Me={[dp]:n.NEVER,[vp]:n.ALWAYS,[fp]:n.LESS,[ru]:n.LEQUAL,[pp]:n.EQUAL,[yp]:n.GEQUAL,[mp]:n.GREATER,[gp]:n.NOTEQUAL};function $e(T,x){if(x.type===Cn&&e.has("OES_texture_float_linear")===!1&&(x.magFilter===Nn||x.magFilter===xl||x.magFilter===ga||x.magFilter===Ui||x.minFilter===Nn||x.minFilter===xl||x.minFilter===ga||x.minFilter===Ui)&&console.warn("THREE.WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),n.texParameteri(T,n.TEXTURE_WRAP_S,oe[x.wrapS]),n.texParameteri(T,n.TEXTURE_WRAP_T,oe[x.wrapT]),(T===n.TEXTURE_3D||T===n.TEXTURE_2D_ARRAY)&&n.texParameteri(T,n.TEXTURE_WRAP_R,oe[x.wrapR]),n.texParameteri(T,n.TEXTURE_MAG_FILTER,ee[x.magFilter]),n.texParameteri(T,n.TEXTURE_MIN_FILTER,ee[x.minFilter]),x.compareFunction&&(n.texParameteri(T,n.TEXTURE_COMPARE_MODE,n.COMPARE_REF_TO_TEXTURE),n.texParameteri(T,n.TEXTURE_COMPARE_FUNC,Me[x.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(x.magFilter===Vt||x.minFilter!==ga&&x.minFilter!==Ui||x.type===Cn&&e.has("OES_texture_float_linear")===!1)return;if(x.anisotropy>1||i.get(x).__currentAnisotropy){let F=e.get("EXT_texture_filter_anisotropic");n.texParameterf(T,F.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(x.anisotropy,r.getMaxAnisotropy())),i.get(x).__currentAnisotropy=x.anisotropy}}}function rt(T,x){let F=!1;T.__webglInit===void 0&&(T.__webglInit=!0,x.addEventListener("dispose",A));let q=x.source,K=f.get(q);K===void 0&&(K={},f.set(q,K));let G=Y(x);if(G!==T.__cacheKey){K[G]===void 0&&(K[G]={texture:n.createTexture(),usedTimes:0},a.memory.textures++,F=!0),K[G].usedTimes++;let Ae=K[T.__cacheKey];Ae!==void 0&&(K[T.__cacheKey].usedTimes--,Ae.usedTimes===0&&w(x)),T.__cacheKey=G,T.__webglTexture=K[G].texture}return F}function Ue(T,x,F){return Math.floor(Math.floor(T/F)/x)}function qe(T,x,F,q){let G=T.updateRanges;if(G.length===0)t.texSubImage2D(n.TEXTURE_2D,0,0,0,x.width,x.height,F,q,x.data);else{G.sort((ne,fe)=>ne.start-fe.start);let Ae=0;for(let ne=1;ne<G.length;ne++){let fe=G[Ae],De=G[ne],Te=fe.start+fe.count,he=Ue(De.start,x.width,4),Ve=Ue(fe.start,x.width,4);De.start<=Te+1&&he===Ve&&Ue(De.start+De.count-1,x.width,4)===he?fe.count=Math.max(fe.count,De.start+De.count-fe.start):(++Ae,G[Ae]=De)}G.length=Ae+1;let ae=n.getParameter(n.UNPACK_ROW_LENGTH),we=n.getParameter(n.UNPACK_SKIP_PIXELS),Ee=n.getParameter(n.UNPACK_SKIP_ROWS);n.pixelStorei(n.UNPACK_ROW_LENGTH,x.width);for(let ne=0,fe=G.length;ne<fe;ne++){let De=G[ne],Te=Math.floor(De.start/4),he=Math.ceil(De.count/4),Ve=Te%x.width,D=Math.floor(Te/x.width),ie=he,le=1;n.pixelStorei(n.UNPACK_SKIP_PIXELS,Ve),n.pixelStorei(n.UNPACK_SKIP_ROWS,D),t.texSubImage2D(n.TEXTURE_2D,0,Ve,D,ie,le,F,q,x.data)}T.clearUpdateRanges(),n.pixelStorei(n.UNPACK_ROW_LENGTH,ae),n.pixelStorei(n.UNPACK_SKIP_PIXELS,we),n.pixelStorei(n.UNPACK_SKIP_ROWS,Ee)}}function $(T,x,F){let q=n.TEXTURE_2D;(x.isDataArrayTexture||x.isCompressedArrayTexture)&&(q=n.TEXTURE_2D_ARRAY),x.isData3DTexture&&(q=n.TEXTURE_3D);let K=rt(T,x),G=x.source;t.bindTexture(q,T.__webglTexture,n.TEXTURE0+F);let Ae=i.get(G);if(G.version!==Ae.__version||K===!0){t.activeTexture(n.TEXTURE0+F);let ae=Ke.getPrimaries(Ke.workingColorSpace),we=x.colorSpace===pi?null:Ke.getPrimaries(x.colorSpace),Ee=x.colorSpace===pi||ae===we?n.NONE:n.BROWSER_DEFAULT_WEBGL;n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,x.flipY),n.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),n.pixelStorei(n.UNPACK_ALIGNMENT,x.unpackAlignment),n.pixelStorei(n.UNPACK_COLORSPACE_CONVERSION_WEBGL,Ee);let ne=y(x.image,!1,r.maxTextureSize);ne=Nt(x,ne);let fe=s.convert(x.format,x.colorSpace),De=s.convert(x.type),Te=_(x.internalFormat,fe,De,x.colorSpace,x.isVideoTexture);$e(q,x);let he,Ve=x.mipmaps,D=x.isVideoTexture!==!0,ie=Ae.__version===void 0||K===!0,le=G.dataReady,ye=E(x,ne);if(x.isDepthTexture)Te=v(x.format===us,x.type),ie&&(D?t.texStorage2D(n.TEXTURE_2D,1,Te,ne.width,ne.height):t.texImage2D(n.TEXTURE_2D,0,Te,ne.width,ne.height,0,fe,De,null));else if(x.isDataTexture)if(Ve.length>0){D&&ie&&t.texStorage2D(n.TEXTURE_2D,ye,Te,Ve[0].width,Ve[0].height);for(let Q=0,J=Ve.length;Q<J;Q++)he=Ve[Q],D?le&&t.texSubImage2D(n.TEXTURE_2D,Q,0,0,he.width,he.height,fe,De,he.data):t.texImage2D(n.TEXTURE_2D,Q,Te,he.width,he.height,0,fe,De,he.data);x.generateMipmaps=!1}else D?(ie&&t.texStorage2D(n.TEXTURE_2D,ye,Te,ne.width,ne.height),le&&qe(x,ne,fe,De)):t.texImage2D(n.TEXTURE_2D,0,Te,ne.width,ne.height,0,fe,De,ne.data);else if(x.isCompressedTexture)if(x.isCompressedArrayTexture){D&&ie&&t.texStorage3D(n.TEXTURE_2D_ARRAY,ye,Te,Ve[0].width,Ve[0].height,ne.depth);for(let Q=0,J=Ve.length;Q<J;Q++)if(he=Ve[Q],x.format!==on)if(fe!==null)if(D){if(le)if(x.layerUpdates.size>0){let be=uu(he.width,he.height,x.format,x.type);for(let Fe of x.layerUpdates){let ft=he.data.subarray(Fe*be/he.data.BYTES_PER_ELEMENT,(Fe+1)*be/he.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(n.TEXTURE_2D_ARRAY,Q,0,0,Fe,he.width,he.height,1,fe,ft)}x.clearLayerUpdates()}else t.compressedTexSubImage3D(n.TEXTURE_2D_ARRAY,Q,0,0,0,he.width,he.height,ne.depth,fe,he.data)}else t.compressedTexImage3D(n.TEXTURE_2D_ARRAY,Q,Te,he.width,he.height,ne.depth,0,he.data,0,0);else console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else D?le&&t.texSubImage3D(n.TEXTURE_2D_ARRAY,Q,0,0,0,he.width,he.height,ne.depth,fe,De,he.data):t.texImage3D(n.TEXTURE_2D_ARRAY,Q,Te,he.width,he.height,ne.depth,0,fe,De,he.data)}else{D&&ie&&t.texStorage2D(n.TEXTURE_2D,ye,Te,Ve[0].width,Ve[0].height);for(let Q=0,J=Ve.length;Q<J;Q++)he=Ve[Q],x.format!==on?fe!==null?D?le&&t.compressedTexSubImage2D(n.TEXTURE_2D,Q,0,0,he.width,he.height,fe,he.data):t.compressedTexImage2D(n.TEXTURE_2D,Q,Te,he.width,he.height,0,he.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):D?le&&t.texSubImage2D(n.TEXTURE_2D,Q,0,0,he.width,he.height,fe,De,he.data):t.texImage2D(n.TEXTURE_2D,Q,Te,he.width,he.height,0,fe,De,he.data)}else if(x.isDataArrayTexture)if(D){if(ie&&t.texStorage3D(n.TEXTURE_2D_ARRAY,ye,Te,ne.width,ne.height,ne.depth),le)if(x.layerUpdates.size>0){let Q=uu(ne.width,ne.height,x.format,x.type);for(let J of x.layerUpdates){let be=ne.data.subarray(J*Q/ne.data.BYTES_PER_ELEMENT,(J+1)*Q/ne.data.BYTES_PER_ELEMENT);t.texSubImage3D(n.TEXTURE_2D_ARRAY,0,0,0,J,ne.width,ne.height,1,fe,De,be)}x.clearLayerUpdates()}else t.texSubImage3D(n.TEXTURE_2D_ARRAY,0,0,0,0,ne.width,ne.height,ne.depth,fe,De,ne.data)}else t.texImage3D(n.TEXTURE_2D_ARRAY,0,Te,ne.width,ne.height,ne.depth,0,fe,De,ne.data);else if(x.isData3DTexture)D?(ie&&t.texStorage3D(n.TEXTURE_3D,ye,Te,ne.width,ne.height,ne.depth),le&&t.texSubImage3D(n.TEXTURE_3D,0,0,0,0,ne.width,ne.height,ne.depth,fe,De,ne.data)):t.texImage3D(n.TEXTURE_3D,0,Te,ne.width,ne.height,ne.depth,0,fe,De,ne.data);else if(x.isFramebufferTexture){if(ie)if(D)t.texStorage2D(n.TEXTURE_2D,ye,Te,ne.width,ne.height);else{let Q=ne.width,J=ne.height;for(let be=0;be<ye;be++)t.texImage2D(n.TEXTURE_2D,be,Te,Q,J,0,fe,De,null),Q>>=1,J>>=1}}else if(Ve.length>0){if(D&&ie){let Q=Mt(Ve[0]);t.texStorage2D(n.TEXTURE_2D,ye,Te,Q.width,Q.height)}for(let Q=0,J=Ve.length;Q<J;Q++)he=Ve[Q],D?le&&t.texSubImage2D(n.TEXTURE_2D,Q,0,0,fe,De,he):t.texImage2D(n.TEXTURE_2D,Q,Te,fe,De,he);x.generateMipmaps=!1}else if(D){if(ie){let Q=Mt(ne);t.texStorage2D(n.TEXTURE_2D,ye,Te,Q.width,Q.height)}le&&t.texSubImage2D(n.TEXTURE_2D,0,0,0,fe,De,ne)}else t.texImage2D(n.TEXTURE_2D,0,Te,fe,De,ne);m(x)&&p(q),Ae.__version=G.version,x.onUpdate&&x.onUpdate(x)}T.__version=x.version}function Z(T,x,F){if(x.image.length!==6)return;let q=rt(T,x),K=x.source;t.bindTexture(n.TEXTURE_CUBE_MAP,T.__webglTexture,n.TEXTURE0+F);let G=i.get(K);if(K.version!==G.__version||q===!0){t.activeTexture(n.TEXTURE0+F);let Ae=Ke.getPrimaries(Ke.workingColorSpace),ae=x.colorSpace===pi?null:Ke.getPrimaries(x.colorSpace),we=x.colorSpace===pi||Ae===ae?n.NONE:n.BROWSER_DEFAULT_WEBGL;n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,x.flipY),n.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),n.pixelStorei(n.UNPACK_ALIGNMENT,x.unpackAlignment),n.pixelStorei(n.UNPACK_COLORSPACE_CONVERSION_WEBGL,we);let Ee=x.isCompressedTexture||x.image[0].isCompressedTexture,ne=x.image[0]&&x.image[0].isDataTexture,fe=[];for(let J=0;J<6;J++)!Ee&&!ne?fe[J]=y(x.image[J],!0,r.maxCubemapSize):fe[J]=ne?x.image[J].image:x.image[J],fe[J]=Nt(x,fe[J]);let De=fe[0],Te=s.convert(x.format,x.colorSpace),he=s.convert(x.type),Ve=_(x.internalFormat,Te,he,x.colorSpace),D=x.isVideoTexture!==!0,ie=G.__version===void 0||q===!0,le=K.dataReady,ye=E(x,De);$e(n.TEXTURE_CUBE_MAP,x);let Q;if(Ee){D&&ie&&t.texStorage2D(n.TEXTURE_CUBE_MAP,ye,Ve,De.width,De.height);for(let J=0;J<6;J++){Q=fe[J].mipmaps;for(let be=0;be<Q.length;be++){let Fe=Q[be];x.format!==on?Te!==null?D?le&&t.compressedTexSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+J,be,0,0,Fe.width,Fe.height,Te,Fe.data):t.compressedTexImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+J,be,Ve,Fe.width,Fe.height,0,Fe.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):D?le&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+J,be,0,0,Fe.width,Fe.height,Te,he,Fe.data):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+J,be,Ve,Fe.width,Fe.height,0,Te,he,Fe.data)}}}else{if(Q=x.mipmaps,D&&ie){Q.length>0&&ye++;let J=Mt(fe[0]);t.texStorage2D(n.TEXTURE_CUBE_MAP,ye,Ve,J.width,J.height)}for(let J=0;J<6;J++)if(ne){D?le&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+J,0,0,0,fe[J].width,fe[J].height,Te,he,fe[J].data):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+J,0,Ve,fe[J].width,fe[J].height,0,Te,he,fe[J].data);for(let be=0;be<Q.length;be++){let ft=Q[be].image[J].image;D?le&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+J,be+1,0,0,ft.width,ft.height,Te,he,ft.data):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+J,be+1,Ve,ft.width,ft.height,0,Te,he,ft.data)}}else{D?le&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+J,0,0,0,Te,he,fe[J]):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+J,0,Ve,Te,he,fe[J]);for(let be=0;be<Q.length;be++){let Fe=Q[be];D?le&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+J,be+1,0,0,Te,he,Fe.image[J]):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+J,be+1,Ve,Te,he,Fe.image[J])}}}m(x)&&p(n.TEXTURE_CUBE_MAP),G.__version=K.version,x.onUpdate&&x.onUpdate(x)}T.__version=x.version}function me(T,x,F,q,K,G){let Ae=s.convert(F.format,F.colorSpace),ae=s.convert(F.type),we=_(F.internalFormat,Ae,ae,F.colorSpace),Ee=i.get(x),ne=i.get(F);if(ne.__renderTarget=x,!Ee.__hasExternalTextures){let fe=Math.max(1,x.width>>G),De=Math.max(1,x.height>>G);K===n.TEXTURE_3D||K===n.TEXTURE_2D_ARRAY?t.texImage3D(K,G,we,fe,De,x.depth,0,Ae,ae,null):t.texImage2D(K,G,we,fe,De,0,Ae,ae,null)}t.bindFramebuffer(n.FRAMEBUFFER,T),Se(x)?o.framebufferTexture2DMultisampleEXT(n.FRAMEBUFFER,q,K,ne.__webglTexture,0,yt(x)):(K===n.TEXTURE_2D||K>=n.TEXTURE_CUBE_MAP_POSITIVE_X&&K<=n.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&n.framebufferTexture2D(n.FRAMEBUFFER,q,K,ne.__webglTexture,G),t.bindFramebuffer(n.FRAMEBUFFER,null)}function ve(T,x,F){if(n.bindRenderbuffer(n.RENDERBUFFER,T),x.depthBuffer){let q=x.depthTexture,K=q&&q.isDepthTexture?q.type:null,G=v(x.stencilBuffer,K),Ae=x.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,ae=yt(x);Se(x)?o.renderbufferStorageMultisampleEXT(n.RENDERBUFFER,ae,G,x.width,x.height):F?n.renderbufferStorageMultisample(n.RENDERBUFFER,ae,G,x.width,x.height):n.renderbufferStorage(n.RENDERBUFFER,G,x.width,x.height),n.framebufferRenderbuffer(n.FRAMEBUFFER,Ae,n.RENDERBUFFER,T)}else{let q=x.textures;for(let K=0;K<q.length;K++){let G=q[K],Ae=s.convert(G.format,G.colorSpace),ae=s.convert(G.type),we=_(G.internalFormat,Ae,ae,G.colorSpace),Ee=yt(x);F&&Se(x)===!1?n.renderbufferStorageMultisample(n.RENDERBUFFER,Ee,we,x.width,x.height):Se(x)?o.renderbufferStorageMultisampleEXT(n.RENDERBUFFER,Ee,we,x.width,x.height):n.renderbufferStorage(n.RENDERBUFFER,we,x.width,x.height)}}n.bindRenderbuffer(n.RENDERBUFFER,null)}function ue(T,x){if(x&&x.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(t.bindFramebuffer(n.FRAMEBUFFER,T),!(x.depthTexture&&x.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");let q=i.get(x.depthTexture);q.__renderTarget=x,(!q.__webglTexture||x.depthTexture.image.width!==x.width||x.depthTexture.image.height!==x.height)&&(x.depthTexture.image.width=x.width,x.depthTexture.image.height=x.height,x.depthTexture.needsUpdate=!0),j(x.depthTexture,0);let K=q.__webglTexture,G=yt(x);if(x.depthTexture.format===Zr)Se(x)?o.framebufferTexture2DMultisampleEXT(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,K,0,G):n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,K,0);else if(x.depthTexture.format===us)Se(x)?o.framebufferTexture2DMultisampleEXT(n.FRAMEBUFFER,n.DEPTH_STENCIL_ATTACHMENT,n.TEXTURE_2D,K,0,G):n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_STENCIL_ATTACHMENT,n.TEXTURE_2D,K,0);else throw new Error("Unknown depthTexture format")}function Ze(T){let x=i.get(T),F=T.isWebGLCubeRenderTarget===!0;if(x.__boundDepthTexture!==T.depthTexture){let q=T.depthTexture;if(x.__depthDisposeCallback&&x.__depthDisposeCallback(),q){let K=()=>{delete x.__boundDepthTexture,delete x.__depthDisposeCallback,q.removeEventListener("dispose",K)};q.addEventListener("dispose",K),x.__depthDisposeCallback=K}x.__boundDepthTexture=q}if(T.depthTexture&&!x.__autoAllocateDepthBuffer){if(F)throw new Error("target.depthTexture not supported in Cube render targets");let q=T.texture.mipmaps;q&&q.length>0?ue(x.__webglFramebuffer[0],T):ue(x.__webglFramebuffer,T)}else if(F){x.__webglDepthbuffer=[];for(let q=0;q<6;q++)if(t.bindFramebuffer(n.FRAMEBUFFER,x.__webglFramebuffer[q]),x.__webglDepthbuffer[q]===void 0)x.__webglDepthbuffer[q]=n.createRenderbuffer(),ve(x.__webglDepthbuffer[q],T,!1);else{let K=T.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,G=x.__webglDepthbuffer[q];n.bindRenderbuffer(n.RENDERBUFFER,G),n.framebufferRenderbuffer(n.FRAMEBUFFER,K,n.RENDERBUFFER,G)}}else{let q=T.texture.mipmaps;if(q&&q.length>0?t.bindFramebuffer(n.FRAMEBUFFER,x.__webglFramebuffer[0]):t.bindFramebuffer(n.FRAMEBUFFER,x.__webglFramebuffer),x.__webglDepthbuffer===void 0)x.__webglDepthbuffer=n.createRenderbuffer(),ve(x.__webglDepthbuffer,T,!1);else{let K=T.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,G=x.__webglDepthbuffer;n.bindRenderbuffer(n.RENDERBUFFER,G),n.framebufferRenderbuffer(n.FRAMEBUFFER,K,n.RENDERBUFFER,G)}}t.bindFramebuffer(n.FRAMEBUFFER,null)}function Ct(T,x,F){let q=i.get(T);x!==void 0&&me(q.__webglFramebuffer,T,T.texture,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,0),F!==void 0&&Ze(T)}function C(T){let x=T.texture,F=i.get(T),q=i.get(x);T.addEventListener("dispose",P);let K=T.textures,G=T.isWebGLCubeRenderTarget===!0,Ae=K.length>1;if(Ae||(q.__webglTexture===void 0&&(q.__webglTexture=n.createTexture()),q.__version=x.version,a.memory.textures++),G){F.__webglFramebuffer=[];for(let ae=0;ae<6;ae++)if(x.mipmaps&&x.mipmaps.length>0){F.__webglFramebuffer[ae]=[];for(let we=0;we<x.mipmaps.length;we++)F.__webglFramebuffer[ae][we]=n.createFramebuffer()}else F.__webglFramebuffer[ae]=n.createFramebuffer()}else{if(x.mipmaps&&x.mipmaps.length>0){F.__webglFramebuffer=[];for(let ae=0;ae<x.mipmaps.length;ae++)F.__webglFramebuffer[ae]=n.createFramebuffer()}else F.__webglFramebuffer=n.createFramebuffer();if(Ae)for(let ae=0,we=K.length;ae<we;ae++){let Ee=i.get(K[ae]);Ee.__webglTexture===void 0&&(Ee.__webglTexture=n.createTexture(),a.memory.textures++)}if(T.samples>0&&Se(T)===!1){F.__webglMultisampledFramebuffer=n.createFramebuffer(),F.__webglColorRenderbuffer=[],t.bindFramebuffer(n.FRAMEBUFFER,F.__webglMultisampledFramebuffer);for(let ae=0;ae<K.length;ae++){let we=K[ae];F.__webglColorRenderbuffer[ae]=n.createRenderbuffer(),n.bindRenderbuffer(n.RENDERBUFFER,F.__webglColorRenderbuffer[ae]);let Ee=s.convert(we.format,we.colorSpace),ne=s.convert(we.type),fe=_(we.internalFormat,Ee,ne,we.colorSpace,T.isXRRenderTarget===!0),De=yt(T);n.renderbufferStorageMultisample(n.RENDERBUFFER,De,fe,T.width,T.height),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+ae,n.RENDERBUFFER,F.__webglColorRenderbuffer[ae])}n.bindRenderbuffer(n.RENDERBUFFER,null),T.depthBuffer&&(F.__webglDepthRenderbuffer=n.createRenderbuffer(),ve(F.__webglDepthRenderbuffer,T,!0)),t.bindFramebuffer(n.FRAMEBUFFER,null)}}if(G){t.bindTexture(n.TEXTURE_CUBE_MAP,q.__webglTexture),$e(n.TEXTURE_CUBE_MAP,x);for(let ae=0;ae<6;ae++)if(x.mipmaps&&x.mipmaps.length>0)for(let we=0;we<x.mipmaps.length;we++)me(F.__webglFramebuffer[ae][we],T,x,n.COLOR_ATTACHMENT0,n.TEXTURE_CUBE_MAP_POSITIVE_X+ae,we);else me(F.__webglFramebuffer[ae],T,x,n.COLOR_ATTACHMENT0,n.TEXTURE_CUBE_MAP_POSITIVE_X+ae,0);m(x)&&p(n.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(Ae){for(let ae=0,we=K.length;ae<we;ae++){let Ee=K[ae],ne=i.get(Ee),fe=n.TEXTURE_2D;(T.isWebGL3DRenderTarget||T.isWebGLArrayRenderTarget)&&(fe=T.isWebGL3DRenderTarget?n.TEXTURE_3D:n.TEXTURE_2D_ARRAY),t.bindTexture(fe,ne.__webglTexture),$e(fe,Ee),me(F.__webglFramebuffer,T,Ee,n.COLOR_ATTACHMENT0+ae,fe,0),m(Ee)&&p(fe)}t.unbindTexture()}else{let ae=n.TEXTURE_2D;if((T.isWebGL3DRenderTarget||T.isWebGLArrayRenderTarget)&&(ae=T.isWebGL3DRenderTarget?n.TEXTURE_3D:n.TEXTURE_2D_ARRAY),t.bindTexture(ae,q.__webglTexture),$e(ae,x),x.mipmaps&&x.mipmaps.length>0)for(let we=0;we<x.mipmaps.length;we++)me(F.__webglFramebuffer[we],T,x,n.COLOR_ATTACHMENT0,ae,we);else me(F.__webglFramebuffer,T,x,n.COLOR_ATTACHMENT0,ae,0);m(x)&&p(ae),t.unbindTexture()}T.depthBuffer&&Ze(T)}function dt(T){let x=T.textures;for(let F=0,q=x.length;F<q;F++){let K=x[F];if(m(K)){let G=b(T),Ae=i.get(K).__webglTexture;t.bindTexture(G,Ae),p(G),t.unbindTexture()}}}let Be=[],Ne=[];function _e(T){if(T.samples>0){if(Se(T)===!1){let x=T.textures,F=T.width,q=T.height,K=n.COLOR_BUFFER_BIT,G=T.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,Ae=i.get(T),ae=x.length>1;if(ae)for(let Ee=0;Ee<x.length;Ee++)t.bindFramebuffer(n.FRAMEBUFFER,Ae.__webglMultisampledFramebuffer),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+Ee,n.RENDERBUFFER,null),t.bindFramebuffer(n.FRAMEBUFFER,Ae.__webglFramebuffer),n.framebufferTexture2D(n.DRAW_FRAMEBUFFER,n.COLOR_ATTACHMENT0+Ee,n.TEXTURE_2D,null,0);t.bindFramebuffer(n.READ_FRAMEBUFFER,Ae.__webglMultisampledFramebuffer);let we=T.texture.mipmaps;we&&we.length>0?t.bindFramebuffer(n.DRAW_FRAMEBUFFER,Ae.__webglFramebuffer[0]):t.bindFramebuffer(n.DRAW_FRAMEBUFFER,Ae.__webglFramebuffer);for(let Ee=0;Ee<x.length;Ee++){if(T.resolveDepthBuffer&&(T.depthBuffer&&(K|=n.DEPTH_BUFFER_BIT),T.stencilBuffer&&T.resolveStencilBuffer&&(K|=n.STENCIL_BUFFER_BIT)),ae){n.framebufferRenderbuffer(n.READ_FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.RENDERBUFFER,Ae.__webglColorRenderbuffer[Ee]);let ne=i.get(x[Ee]).__webglTexture;n.framebufferTexture2D(n.DRAW_FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,ne,0)}n.blitFramebuffer(0,0,F,q,0,0,F,q,K,n.NEAREST),l===!0&&(Be.length=0,Ne.length=0,Be.push(n.COLOR_ATTACHMENT0+Ee),T.depthBuffer&&T.resolveDepthBuffer===!1&&(Be.push(G),Ne.push(G),n.invalidateFramebuffer(n.DRAW_FRAMEBUFFER,Ne)),n.invalidateFramebuffer(n.READ_FRAMEBUFFER,Be))}if(t.bindFramebuffer(n.READ_FRAMEBUFFER,null),t.bindFramebuffer(n.DRAW_FRAMEBUFFER,null),ae)for(let Ee=0;Ee<x.length;Ee++){t.bindFramebuffer(n.FRAMEBUFFER,Ae.__webglMultisampledFramebuffer),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+Ee,n.RENDERBUFFER,Ae.__webglColorRenderbuffer[Ee]);let ne=i.get(x[Ee]).__webglTexture;t.bindFramebuffer(n.FRAMEBUFFER,Ae.__webglFramebuffer),n.framebufferTexture2D(n.DRAW_FRAMEBUFFER,n.COLOR_ATTACHMENT0+Ee,n.TEXTURE_2D,ne,0)}t.bindFramebuffer(n.DRAW_FRAMEBUFFER,Ae.__webglMultisampledFramebuffer)}else if(T.depthBuffer&&T.resolveDepthBuffer===!1&&l){let x=T.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT;n.invalidateFramebuffer(n.DRAW_FRAMEBUFFER,[x])}}}function yt(T){return Math.min(r.maxSamples,T.samples)}function Se(T){let x=i.get(T);return T.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&x.__useRenderToTexture!==!1}function He(T){let x=a.render.frame;h.get(T)!==x&&(h.set(T,x),T.update())}function Nt(T,x){let F=T.colorSpace,q=T.format,K=T.type;return T.isCompressedTexture===!0||T.isVideoTexture===!0||F!==ui&&F!==pi&&(Ke.getTransfer(F)===at?(q!==on||K!==jn)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",F)),x}function Mt(T){return typeof HTMLImageElement<"u"&&T instanceof HTMLImageElement?(c.width=T.naturalWidth||T.width,c.height=T.naturalHeight||T.height):typeof VideoFrame<"u"&&T instanceof VideoFrame?(c.width=T.displayWidth,c.height=T.displayHeight):(c.width=T.width,c.height=T.height),c}this.allocateTextureUnit=W,this.resetTextureUnits=V,this.setTexture2D=j,this.setTexture2DArray=X,this.setTexture3D=re,this.setTextureCube=H,this.rebindTextures=Ct,this.setupRenderTarget=C,this.updateRenderTargetMipmap=dt,this.updateMultisampleRenderTarget=_e,this.setupDepthRenderbuffer=Ze,this.setupFrameBufferTexture=me,this.useMultisampledRTT=Se}function nS(n,e){function t(i,r=pi){let s,a=Ke.getTransfer(r);if(i===jn)return n.UNSIGNED_BYTE;if(i===_l)return n.UNSIGNED_SHORT_4_4_4_4;if(i===Sl)return n.UNSIGNED_SHORT_5_5_5_1;if(i===Kh)return n.UNSIGNED_INT_5_9_9_9_REV;if(i===Qh)return n.UNSIGNED_INT_10F_11F_11F_REV;if(i===Jh)return n.BYTE;if(i===Zh)return n.SHORT;if(i===ls)return n.UNSIGNED_SHORT;if(i===bl)return n.INT;if(i===Fi)return n.UNSIGNED_INT;if(i===Cn)return n.FLOAT;if(i===cs)return n.HALF_FLOAT;if(i===eu)return n.ALPHA;if(i===tu)return n.RGB;if(i===on)return n.RGBA;if(i===Zr)return n.DEPTH_COMPONENT;if(i===us)return n.DEPTH_STENCIL;if(i===nu)return n.RED;if(i===wl)return n.RED_INTEGER;if(i===iu)return n.RG;if(i===Ml)return n.RG_INTEGER;if(i===El)return n.RGBA_INTEGER;if(i===ya||i===va||i===xa||i===ba)if(a===at)if(s=e.get("WEBGL_compressed_texture_s3tc_srgb"),s!==null){if(i===ya)return s.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(i===va)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(i===xa)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(i===ba)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(s=e.get("WEBGL_compressed_texture_s3tc"),s!==null){if(i===ya)return s.COMPRESSED_RGB_S3TC_DXT1_EXT;if(i===va)return s.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(i===xa)return s.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(i===ba)return s.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(i===Tl||i===Al||i===Cl||i===Rl)if(s=e.get("WEBGL_compressed_texture_pvrtc"),s!==null){if(i===Tl)return s.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(i===Al)return s.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(i===Cl)return s.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(i===Rl)return s.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(i===Pl||i===Il||i===Ll)if(s=e.get("WEBGL_compressed_texture_etc"),s!==null){if(i===Pl||i===Il)return a===at?s.COMPRESSED_SRGB8_ETC2:s.COMPRESSED_RGB8_ETC2;if(i===Ll)return a===at?s.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:s.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(i===Dl||i===kl||i===Nl||i===Ol||i===Ul||i===Fl||i===Bl||i===zl||i===Vl||i===Hl||i===Gl||i===Wl||i===$l||i===Xl)if(s=e.get("WEBGL_compressed_texture_astc"),s!==null){if(i===Dl)return a===at?s.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:s.COMPRESSED_RGBA_ASTC_4x4_KHR;if(i===kl)return a===at?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:s.COMPRESSED_RGBA_ASTC_5x4_KHR;if(i===Nl)return a===at?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:s.COMPRESSED_RGBA_ASTC_5x5_KHR;if(i===Ol)return a===at?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:s.COMPRESSED_RGBA_ASTC_6x5_KHR;if(i===Ul)return a===at?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:s.COMPRESSED_RGBA_ASTC_6x6_KHR;if(i===Fl)return a===at?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:s.COMPRESSED_RGBA_ASTC_8x5_KHR;if(i===Bl)return a===at?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:s.COMPRESSED_RGBA_ASTC_8x6_KHR;if(i===zl)return a===at?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:s.COMPRESSED_RGBA_ASTC_8x8_KHR;if(i===Vl)return a===at?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:s.COMPRESSED_RGBA_ASTC_10x5_KHR;if(i===Hl)return a===at?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:s.COMPRESSED_RGBA_ASTC_10x6_KHR;if(i===Gl)return a===at?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:s.COMPRESSED_RGBA_ASTC_10x8_KHR;if(i===Wl)return a===at?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:s.COMPRESSED_RGBA_ASTC_10x10_KHR;if(i===$l)return a===at?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:s.COMPRESSED_RGBA_ASTC_12x10_KHR;if(i===Xl)return a===at?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:s.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(i===ql||i===Yl||i===jl)if(s=e.get("EXT_texture_compression_bptc"),s!==null){if(i===ql)return a===at?s.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:s.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(i===Yl)return s.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(i===jl)return s.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(i===Jl||i===Zl||i===Kl||i===Ql)if(s=e.get("EXT_texture_compression_rgtc"),s!==null){if(i===Jl)return s.COMPRESSED_RED_RGTC1_EXT;if(i===Zl)return s.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(i===Kl)return s.COMPRESSED_RED_GREEN_RGTC2_EXT;if(i===Ql)return s.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return i===hs?n.UNSIGNED_INT_24_8:n[i]!==void 0?n[i]:null}return{convert:t}}var iS=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,rS=`
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

}`,Mu=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){let i=new ua(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=i}}getMesh(e){if(this.texture!==null&&this.mesh===null){let t=e.cameras[0].viewport,i=new an({vertexShader:iS,fragmentShader:rS,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new It(new fr(20,20),i)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},Eu=class extends Xn{constructor(e,t){super();let i=this,r=null,s=1,a=null,o="local-floor",l=1,c=null,h=null,u=null,f=null,d=null,g=null,y=typeof XRWebGLBinding<"u",m=new Mu,p={},b=t.getContextAttributes(),_=null,v=null,E=[],A=[],P=new Le,k=null,w=new $t;w.viewport=new ut;let M=new $t;M.viewport=new ut;let L=[w,M],V=new cl,W=null,Y=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function($){let Z=E[$];return Z===void 0&&(Z=new ns,E[$]=Z),Z.getTargetRaySpace()},this.getControllerGrip=function($){let Z=E[$];return Z===void 0&&(Z=new ns,E[$]=Z),Z.getGripSpace()},this.getHand=function($){let Z=E[$];return Z===void 0&&(Z=new ns,E[$]=Z),Z.getHandSpace()};function j($){let Z=A.indexOf($.inputSource);if(Z===-1)return;let me=E[Z];me!==void 0&&(me.update($.inputSource,$.frame,c||a),me.dispatchEvent({type:$.type,data:$.inputSource}))}function X(){r.removeEventListener("select",j),r.removeEventListener("selectstart",j),r.removeEventListener("selectend",j),r.removeEventListener("squeeze",j),r.removeEventListener("squeezestart",j),r.removeEventListener("squeezeend",j),r.removeEventListener("end",X),r.removeEventListener("inputsourceschange",re);for(let $=0;$<E.length;$++){let Z=A[$];Z!==null&&(A[$]=null,E[$].disconnect(Z))}W=null,Y=null,m.reset();for(let $ in p)delete p[$];e.setRenderTarget(_),d=null,f=null,u=null,r=null,v=null,qe.stop(),i.isPresenting=!1,e.setPixelRatio(k),e.setSize(P.width,P.height,!1),i.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function($){s=$,i.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function($){o=$,i.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function($){c=$},this.getBaseLayer=function(){return f!==null?f:d},this.getBinding=function(){return u===null&&y&&(u=new XRWebGLBinding(r,t)),u},this.getFrame=function(){return g},this.getSession=function(){return r},this.setSession=async function($){if(r=$,r!==null){if(_=e.getRenderTarget(),r.addEventListener("select",j),r.addEventListener("selectstart",j),r.addEventListener("selectend",j),r.addEventListener("squeeze",j),r.addEventListener("squeezestart",j),r.addEventListener("squeezeend",j),r.addEventListener("end",X),r.addEventListener("inputsourceschange",re),b.xrCompatible!==!0&&await t.makeXRCompatible(),k=e.getPixelRatio(),e.getSize(P),y&&"createProjectionLayer"in XRWebGLBinding.prototype){let me=null,ve=null,ue=null;b.depth&&(ue=b.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,me=b.stencil?us:Zr,ve=b.stencil?hs:Fi);let Ze={colorFormat:t.RGBA8,depthFormat:ue,scaleFactor:s};u=this.getBinding(),f=u.createProjectionLayer(Ze),r.updateRenderState({layers:[f]}),e.setPixelRatio(1),e.setSize(f.textureWidth,f.textureHeight,!1),v=new En(f.textureWidth,f.textureHeight,{format:on,type:jn,depthTexture:new ha(f.textureWidth,f.textureHeight,ve,void 0,void 0,void 0,void 0,void 0,void 0,me),stencilBuffer:b.stencil,colorSpace:e.outputColorSpace,samples:b.antialias?4:0,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1})}else{let me={antialias:b.antialias,alpha:!0,depth:b.depth,stencil:b.stencil,framebufferScaleFactor:s};d=new XRWebGLLayer(r,t,me),r.updateRenderState({baseLayer:d}),e.setPixelRatio(1),e.setSize(d.framebufferWidth,d.framebufferHeight,!1),v=new En(d.framebufferWidth,d.framebufferHeight,{format:on,type:jn,colorSpace:e.outputColorSpace,stencilBuffer:b.stencil,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1})}v.isXRRenderTarget=!0,this.setFoveation(l),c=null,a=await r.requestReferenceSpace(o),qe.setContext(r),qe.start(),i.isPresenting=!0,i.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(r!==null)return r.environmentBlendMode},this.getDepthTexture=function(){return m.getDepthTexture()};function re($){for(let Z=0;Z<$.removed.length;Z++){let me=$.removed[Z],ve=A.indexOf(me);ve>=0&&(A[ve]=null,E[ve].disconnect(me))}for(let Z=0;Z<$.added.length;Z++){let me=$.added[Z],ve=A.indexOf(me);if(ve===-1){for(let Ze=0;Ze<E.length;Ze++)if(Ze>=A.length){A.push(me),ve=Ze;break}else if(A[Ze]===null){A[Ze]=me,ve=Ze;break}if(ve===-1)break}let ue=E[ve];ue&&ue.connect(me)}}let H=new N,oe=new N;function ee($,Z,me){H.setFromMatrixPosition(Z.matrixWorld),oe.setFromMatrixPosition(me.matrixWorld);let ve=H.distanceTo(oe),ue=Z.projectionMatrix.elements,Ze=me.projectionMatrix.elements,Ct=ue[14]/(ue[10]-1),C=ue[14]/(ue[10]+1),dt=(ue[9]+1)/ue[5],Be=(ue[9]-1)/ue[5],Ne=(ue[8]-1)/ue[0],_e=(Ze[8]+1)/Ze[0],yt=Ct*Ne,Se=Ct*_e,He=ve/(-Ne+_e),Nt=He*-Ne;if(Z.matrixWorld.decompose($.position,$.quaternion,$.scale),$.translateX(Nt),$.translateZ(He),$.matrixWorld.compose($.position,$.quaternion,$.scale),$.matrixWorldInverse.copy($.matrixWorld).invert(),ue[10]===-1)$.projectionMatrix.copy(Z.projectionMatrix),$.projectionMatrixInverse.copy(Z.projectionMatrixInverse);else{let Mt=Ct+He,T=C+He,x=yt-Nt,F=Se+(ve-Nt),q=dt*C/T*Mt,K=Be*C/T*Mt;$.projectionMatrix.makePerspective(x,F,q,K,Mt,T),$.projectionMatrixInverse.copy($.projectionMatrix).invert()}}function Me($,Z){Z===null?$.matrixWorld.copy($.matrix):$.matrixWorld.multiplyMatrices(Z.matrixWorld,$.matrix),$.matrixWorldInverse.copy($.matrixWorld).invert()}this.updateCamera=function($){if(r===null)return;let Z=$.near,me=$.far;m.texture!==null&&(m.depthNear>0&&(Z=m.depthNear),m.depthFar>0&&(me=m.depthFar)),V.near=M.near=w.near=Z,V.far=M.far=w.far=me,(W!==V.near||Y!==V.far)&&(r.updateRenderState({depthNear:V.near,depthFar:V.far}),W=V.near,Y=V.far),V.layers.mask=$.layers.mask|6,w.layers.mask=V.layers.mask&3,M.layers.mask=V.layers.mask&5;let ve=$.parent,ue=V.cameras;Me(V,ve);for(let Ze=0;Ze<ue.length;Ze++)Me(ue[Ze],ve);ue.length===2?ee(V,w,M):V.projectionMatrix.copy(w.projectionMatrix),$e($,V,ve)};function $e($,Z,me){me===null?$.matrix.copy(Z.matrixWorld):($.matrix.copy(me.matrixWorld),$.matrix.invert(),$.matrix.multiply(Z.matrixWorld)),$.matrix.decompose($.position,$.quaternion,$.scale),$.updateMatrixWorld(!0),$.projectionMatrix.copy(Z.projectionMatrix),$.projectionMatrixInverse.copy(Z.projectionMatrixInverse),$.isPerspectiveCamera&&($.fov=Kr*2*Math.atan(1/$.projectionMatrix.elements[5]),$.zoom=1)}this.getCamera=function(){return V},this.getFoveation=function(){if(!(f===null&&d===null))return l},this.setFoveation=function($){l=$,f!==null&&(f.fixedFoveation=$),d!==null&&d.fixedFoveation!==void 0&&(d.fixedFoveation=$)},this.hasDepthSensing=function(){return m.texture!==null},this.getDepthSensingMesh=function(){return m.getMesh(V)},this.getCameraTexture=function($){return p[$]};let rt=null;function Ue($,Z){if(h=Z.getViewerPose(c||a),g=Z,h!==null){let me=h.views;d!==null&&(e.setRenderTargetFramebuffer(v,d.framebuffer),e.setRenderTarget(v));let ve=!1;me.length!==V.cameras.length&&(V.cameras.length=0,ve=!0);for(let C=0;C<me.length;C++){let dt=me[C],Be=null;if(d!==null)Be=d.getViewport(dt);else{let _e=u.getViewSubImage(f,dt);Be=_e.viewport,C===0&&(e.setRenderTargetTextures(v,_e.colorTexture,_e.depthStencilTexture),e.setRenderTarget(v))}let Ne=L[C];Ne===void 0&&(Ne=new $t,Ne.layers.enable(C),Ne.viewport=new ut,L[C]=Ne),Ne.matrix.fromArray(dt.transform.matrix),Ne.matrix.decompose(Ne.position,Ne.quaternion,Ne.scale),Ne.projectionMatrix.fromArray(dt.projectionMatrix),Ne.projectionMatrixInverse.copy(Ne.projectionMatrix).invert(),Ne.viewport.set(Be.x,Be.y,Be.width,Be.height),C===0&&(V.matrix.copy(Ne.matrix),V.matrix.decompose(V.position,V.quaternion,V.scale)),ve===!0&&V.cameras.push(Ne)}let ue=r.enabledFeatures;if(ue&&ue.includes("depth-sensing")&&r.depthUsage=="gpu-optimized"&&y){u=i.getBinding();let C=u.getDepthInformation(me[0]);C&&C.isValid&&C.texture&&m.init(C,r.renderState)}if(ue&&ue.includes("camera-access")&&y){e.state.unbindTexture(),u=i.getBinding();for(let C=0;C<me.length;C++){let dt=me[C].camera;if(dt){let Be=p[dt];Be||(Be=new ua,p[dt]=Be);let Ne=u.getCameraImage(dt);Be.sourceTexture=Ne}}}}for(let me=0;me<E.length;me++){let ve=A[me],ue=E[me];ve!==null&&ue!==void 0&&ue.update(ve,Z,c||a)}rt&&rt($,Z),Z.detectedPlanes&&i.dispatchEvent({type:"planesdetected",data:Z}),g=null}let qe=new qp;qe.setAnimationLoop(Ue),this.setAnimationLoop=function($){rt=$},this.dispose=function(){}}},xr=new qn,sS=new bt;function aS(n,e){function t(m,p){m.matrixAutoUpdate===!0&&m.updateMatrix(),p.value.copy(m.matrix)}function i(m,p){p.color.getRGB(m.fogColor.value,lu(n)),p.isFog?(m.fogNear.value=p.near,m.fogFar.value=p.far):p.isFogExp2&&(m.fogDensity.value=p.density)}function r(m,p,b,_,v){p.isMeshBasicMaterial||p.isMeshLambertMaterial?s(m,p):p.isMeshToonMaterial?(s(m,p),u(m,p)):p.isMeshPhongMaterial?(s(m,p),h(m,p)):p.isMeshStandardMaterial?(s(m,p),f(m,p),p.isMeshPhysicalMaterial&&d(m,p,v)):p.isMeshMatcapMaterial?(s(m,p),g(m,p)):p.isMeshDepthMaterial?s(m,p):p.isMeshDistanceMaterial?(s(m,p),y(m,p)):p.isMeshNormalMaterial?s(m,p):p.isLineBasicMaterial?(a(m,p),p.isLineDashedMaterial&&o(m,p)):p.isPointsMaterial?l(m,p,b,_):p.isSpriteMaterial?c(m,p):p.isShadowMaterial?(m.color.value.copy(p.color),m.opacity.value=p.opacity):p.isShaderMaterial&&(p.uniformsNeedUpdate=!1)}function s(m,p){m.opacity.value=p.opacity,p.color&&m.diffuse.value.copy(p.color),p.emissive&&m.emissive.value.copy(p.emissive).multiplyScalar(p.emissiveIntensity),p.map&&(m.map.value=p.map,t(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,t(p.alphaMap,m.alphaMapTransform)),p.bumpMap&&(m.bumpMap.value=p.bumpMap,t(p.bumpMap,m.bumpMapTransform),m.bumpScale.value=p.bumpScale,p.side===en&&(m.bumpScale.value*=-1)),p.normalMap&&(m.normalMap.value=p.normalMap,t(p.normalMap,m.normalMapTransform),m.normalScale.value.copy(p.normalScale),p.side===en&&m.normalScale.value.negate()),p.displacementMap&&(m.displacementMap.value=p.displacementMap,t(p.displacementMap,m.displacementMapTransform),m.displacementScale.value=p.displacementScale,m.displacementBias.value=p.displacementBias),p.emissiveMap&&(m.emissiveMap.value=p.emissiveMap,t(p.emissiveMap,m.emissiveMapTransform)),p.specularMap&&(m.specularMap.value=p.specularMap,t(p.specularMap,m.specularMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest);let b=e.get(p),_=b.envMap,v=b.envMapRotation;_&&(m.envMap.value=_,xr.copy(v),xr.x*=-1,xr.y*=-1,xr.z*=-1,_.isCubeTexture&&_.isRenderTargetTexture===!1&&(xr.y*=-1,xr.z*=-1),m.envMapRotation.value.setFromMatrix4(sS.makeRotationFromEuler(xr)),m.flipEnvMap.value=_.isCubeTexture&&_.isRenderTargetTexture===!1?-1:1,m.reflectivity.value=p.reflectivity,m.ior.value=p.ior,m.refractionRatio.value=p.refractionRatio),p.lightMap&&(m.lightMap.value=p.lightMap,m.lightMapIntensity.value=p.lightMapIntensity,t(p.lightMap,m.lightMapTransform)),p.aoMap&&(m.aoMap.value=p.aoMap,m.aoMapIntensity.value=p.aoMapIntensity,t(p.aoMap,m.aoMapTransform))}function a(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,p.map&&(m.map.value=p.map,t(p.map,m.mapTransform))}function o(m,p){m.dashSize.value=p.dashSize,m.totalSize.value=p.dashSize+p.gapSize,m.scale.value=p.scale}function l(m,p,b,_){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.size.value=p.size*b,m.scale.value=_*.5,p.map&&(m.map.value=p.map,t(p.map,m.uvTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,t(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function c(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.rotation.value=p.rotation,p.map&&(m.map.value=p.map,t(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,t(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function h(m,p){m.specular.value.copy(p.specular),m.shininess.value=Math.max(p.shininess,1e-4)}function u(m,p){p.gradientMap&&(m.gradientMap.value=p.gradientMap)}function f(m,p){m.metalness.value=p.metalness,p.metalnessMap&&(m.metalnessMap.value=p.metalnessMap,t(p.metalnessMap,m.metalnessMapTransform)),m.roughness.value=p.roughness,p.roughnessMap&&(m.roughnessMap.value=p.roughnessMap,t(p.roughnessMap,m.roughnessMapTransform)),p.envMap&&(m.envMapIntensity.value=p.envMapIntensity)}function d(m,p,b){m.ior.value=p.ior,p.sheen>0&&(m.sheenColor.value.copy(p.sheenColor).multiplyScalar(p.sheen),m.sheenRoughness.value=p.sheenRoughness,p.sheenColorMap&&(m.sheenColorMap.value=p.sheenColorMap,t(p.sheenColorMap,m.sheenColorMapTransform)),p.sheenRoughnessMap&&(m.sheenRoughnessMap.value=p.sheenRoughnessMap,t(p.sheenRoughnessMap,m.sheenRoughnessMapTransform))),p.clearcoat>0&&(m.clearcoat.value=p.clearcoat,m.clearcoatRoughness.value=p.clearcoatRoughness,p.clearcoatMap&&(m.clearcoatMap.value=p.clearcoatMap,t(p.clearcoatMap,m.clearcoatMapTransform)),p.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=p.clearcoatRoughnessMap,t(p.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),p.clearcoatNormalMap&&(m.clearcoatNormalMap.value=p.clearcoatNormalMap,t(p.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(p.clearcoatNormalScale),p.side===en&&m.clearcoatNormalScale.value.negate())),p.dispersion>0&&(m.dispersion.value=p.dispersion),p.iridescence>0&&(m.iridescence.value=p.iridescence,m.iridescenceIOR.value=p.iridescenceIOR,m.iridescenceThicknessMinimum.value=p.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=p.iridescenceThicknessRange[1],p.iridescenceMap&&(m.iridescenceMap.value=p.iridescenceMap,t(p.iridescenceMap,m.iridescenceMapTransform)),p.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=p.iridescenceThicknessMap,t(p.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),p.transmission>0&&(m.transmission.value=p.transmission,m.transmissionSamplerMap.value=b.texture,m.transmissionSamplerSize.value.set(b.width,b.height),p.transmissionMap&&(m.transmissionMap.value=p.transmissionMap,t(p.transmissionMap,m.transmissionMapTransform)),m.thickness.value=p.thickness,p.thicknessMap&&(m.thicknessMap.value=p.thicknessMap,t(p.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=p.attenuationDistance,m.attenuationColor.value.copy(p.attenuationColor)),p.anisotropy>0&&(m.anisotropyVector.value.set(p.anisotropy*Math.cos(p.anisotropyRotation),p.anisotropy*Math.sin(p.anisotropyRotation)),p.anisotropyMap&&(m.anisotropyMap.value=p.anisotropyMap,t(p.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=p.specularIntensity,m.specularColor.value.copy(p.specularColor),p.specularColorMap&&(m.specularColorMap.value=p.specularColorMap,t(p.specularColorMap,m.specularColorMapTransform)),p.specularIntensityMap&&(m.specularIntensityMap.value=p.specularIntensityMap,t(p.specularIntensityMap,m.specularIntensityMapTransform))}function g(m,p){p.matcap&&(m.matcap.value=p.matcap)}function y(m,p){let b=e.get(p).light;m.referencePosition.value.setFromMatrixPosition(b.matrixWorld),m.nearDistance.value=b.shadow.camera.near,m.farDistance.value=b.shadow.camera.far}return{refreshFogUniforms:i,refreshMaterialUniforms:r}}function oS(n,e,t,i){let r={},s={},a=[],o=n.getParameter(n.MAX_UNIFORM_BUFFER_BINDINGS);function l(b,_){let v=_.program;i.uniformBlockBinding(b,v)}function c(b,_){let v=r[b.id];v===void 0&&(g(b),v=h(b),r[b.id]=v,b.addEventListener("dispose",m));let E=_.program;i.updateUBOMapping(b,E);let A=e.render.frame;s[b.id]!==A&&(f(b),s[b.id]=A)}function h(b){let _=u();b.__bindingPointIndex=_;let v=n.createBuffer(),E=b.__size,A=b.usage;return n.bindBuffer(n.UNIFORM_BUFFER,v),n.bufferData(n.UNIFORM_BUFFER,E,A),n.bindBuffer(n.UNIFORM_BUFFER,null),n.bindBufferBase(n.UNIFORM_BUFFER,_,v),v}function u(){for(let b=0;b<o;b++)if(a.indexOf(b)===-1)return a.push(b),b;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function f(b){let _=r[b.id],v=b.uniforms,E=b.__cache;n.bindBuffer(n.UNIFORM_BUFFER,_);for(let A=0,P=v.length;A<P;A++){let k=Array.isArray(v[A])?v[A]:[v[A]];for(let w=0,M=k.length;w<M;w++){let L=k[w];if(d(L,A,w,E)===!0){let V=L.__offset,W=Array.isArray(L.value)?L.value:[L.value],Y=0;for(let j=0;j<W.length;j++){let X=W[j],re=y(X);typeof X=="number"||typeof X=="boolean"?(L.__data[0]=X,n.bufferSubData(n.UNIFORM_BUFFER,V+Y,L.__data)):X.isMatrix3?(L.__data[0]=X.elements[0],L.__data[1]=X.elements[1],L.__data[2]=X.elements[2],L.__data[3]=0,L.__data[4]=X.elements[3],L.__data[5]=X.elements[4],L.__data[6]=X.elements[5],L.__data[7]=0,L.__data[8]=X.elements[6],L.__data[9]=X.elements[7],L.__data[10]=X.elements[8],L.__data[11]=0):(X.toArray(L.__data,Y),Y+=re.storage/Float32Array.BYTES_PER_ELEMENT)}n.bufferSubData(n.UNIFORM_BUFFER,V,L.__data)}}}n.bindBuffer(n.UNIFORM_BUFFER,null)}function d(b,_,v,E){let A=b.value,P=_+"_"+v;if(E[P]===void 0)return typeof A=="number"||typeof A=="boolean"?E[P]=A:E[P]=A.clone(),!0;{let k=E[P];if(typeof A=="number"||typeof A=="boolean"){if(k!==A)return E[P]=A,!0}else if(k.equals(A)===!1)return k.copy(A),!0}return!1}function g(b){let _=b.uniforms,v=0,E=16;for(let P=0,k=_.length;P<k;P++){let w=Array.isArray(_[P])?_[P]:[_[P]];for(let M=0,L=w.length;M<L;M++){let V=w[M],W=Array.isArray(V.value)?V.value:[V.value];for(let Y=0,j=W.length;Y<j;Y++){let X=W[Y],re=y(X),H=v%E,oe=H%re.boundary,ee=H+oe;v+=oe,ee!==0&&E-ee<re.storage&&(v+=E-ee),V.__data=new Float32Array(re.storage/Float32Array.BYTES_PER_ELEMENT),V.__offset=v,v+=re.storage}}}let A=v%E;return A>0&&(v+=E-A),b.__size=v,b.__cache={},this}function y(b){let _={boundary:0,storage:0};return typeof b=="number"||typeof b=="boolean"?(_.boundary=4,_.storage=4):b.isVector2?(_.boundary=8,_.storage=8):b.isVector3||b.isColor?(_.boundary=16,_.storage=12):b.isVector4?(_.boundary=16,_.storage=16):b.isMatrix3?(_.boundary=48,_.storage=48):b.isMatrix4?(_.boundary=64,_.storage=64):b.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",b),_}function m(b){let _=b.target;_.removeEventListener("dispose",m);let v=a.indexOf(_.__bindingPointIndex);a.splice(v,1),n.deleteBuffer(r[_.id]),delete r[_.id],delete s[_.id]}function p(){for(let b in r)n.deleteBuffer(r[b]);a=[],r={},s={}}return{bind:l,update:c,dispose:p}}var rc=class{constructor(e={}){let{canvas:t=xp(),context:i=null,depth:r=!0,stencil:s=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:u=!1,reversedDepthBuffer:f=!1}=e;this.isWebGLRenderer=!0;let d;if(i!==null){if(typeof WebGLRenderingContext<"u"&&i instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");d=i.getContextAttributes().alpha}else d=a;let g=new Uint32Array(4),y=new Int32Array(4),m=null,p=null,b=[],_=[];this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=fi,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let v=this,E=!1;this._outputColorSpace=mn;let A=0,P=0,k=null,w=-1,M=null,L=new ut,V=new ut,W=null,Y=new Je(0),j=0,X=t.width,re=t.height,H=1,oe=null,ee=null,Me=new ut(0,0,X,re),$e=new ut(0,0,X,re),rt=!1,Ue=new la,qe=!1,$=!1,Z=new bt,me=new N,ve=new ut,ue={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},Ze=!1;function Ct(){return k===null?H:1}let C=i;function dt(S,O){return t.getContext(S,O)}try{let S={alpha:!0,depth:r,stencil:s,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:u};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${"180"}`),t.addEventListener("webglcontextlost",le,!1),t.addEventListener("webglcontextrestored",ye,!1),t.addEventListener("webglcontextcreationerror",Q,!1),C===null){let O="webgl2";if(C=dt(O,S),C===null)throw dt(O)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(S){throw console.error("THREE.WebGLRenderer: "+S.message),S}let Be,Ne,_e,yt,Se,He,Nt,Mt,T,x,F,q,K,G,Ae,ae,we,Ee,ne,fe,De,Te,he,Ve;function D(){Be=new Eb(C),Be.init(),Te=new nS(C,Be),Ne=new vb(C,Be,e,Te),_e=new eS(C,Be),Ne.reversedDepthBuffer&&f&&_e.buffers.depth.setReversed(!0),yt=new Cb(C),Se=new V_,He=new tS(C,Be,_e,Se,Ne,Te,yt),Nt=new bb(v),Mt=new Mb(v),T=new k0(C),he=new gb(C,T),x=new Tb(C,T,yt,he),F=new Pb(C,x,T,yt),ne=new Rb(C,Ne,He),ae=new xb(Se),q=new z_(v,Nt,Mt,Be,Ne,he,ae),K=new aS(v,Se),G=new G_,Ae=new j_(Be),Ee=new mb(v,Nt,Mt,_e,F,d,l),we=new K_(v,F,Ne),Ve=new oS(C,yt,Ne,_e),fe=new yb(C,Be,yt),De=new Ab(C,Be,yt),yt.programs=q.programs,v.capabilities=Ne,v.extensions=Be,v.properties=Se,v.renderLists=G,v.shadowMap=we,v.state=_e,v.info=yt}D();let ie=new Eu(v,C);this.xr=ie,this.getContext=function(){return C},this.getContextAttributes=function(){return C.getContextAttributes()},this.forceContextLoss=function(){let S=Be.get("WEBGL_lose_context");S&&S.loseContext()},this.forceContextRestore=function(){let S=Be.get("WEBGL_lose_context");S&&S.restoreContext()},this.getPixelRatio=function(){return H},this.setPixelRatio=function(S){S!==void 0&&(H=S,this.setSize(X,re,!1))},this.getSize=function(S){return S.set(X,re)},this.setSize=function(S,O,B=!0){if(ie.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}X=S,re=O,t.width=Math.floor(S*H),t.height=Math.floor(O*H),B===!0&&(t.style.width=S+"px",t.style.height=O+"px"),this.setViewport(0,0,S,O)},this.getDrawingBufferSize=function(S){return S.set(X*H,re*H).floor()},this.setDrawingBufferSize=function(S,O,B){X=S,re=O,H=B,t.width=Math.floor(S*B),t.height=Math.floor(O*B),this.setViewport(0,0,S,O)},this.getCurrentViewport=function(S){return S.copy(L)},this.getViewport=function(S){return S.copy(Me)},this.setViewport=function(S,O,B,z){S.isVector4?Me.set(S.x,S.y,S.z,S.w):Me.set(S,O,B,z),_e.viewport(L.copy(Me).multiplyScalar(H).round())},this.getScissor=function(S){return S.copy($e)},this.setScissor=function(S,O,B,z){S.isVector4?$e.set(S.x,S.y,S.z,S.w):$e.set(S,O,B,z),_e.scissor(V.copy($e).multiplyScalar(H).round())},this.getScissorTest=function(){return rt},this.setScissorTest=function(S){_e.setScissorTest(rt=S)},this.setOpaqueSort=function(S){oe=S},this.setTransparentSort=function(S){ee=S},this.getClearColor=function(S){return S.copy(Ee.getClearColor())},this.setClearColor=function(){Ee.setClearColor(...arguments)},this.getClearAlpha=function(){return Ee.getClearAlpha()},this.setClearAlpha=function(){Ee.setClearAlpha(...arguments)},this.clear=function(S=!0,O=!0,B=!0){let z=0;if(S){let U=!1;if(k!==null){let te=k.texture.format;U=te===El||te===Ml||te===wl}if(U){let te=k.texture.type,de=te===jn||te===Fi||te===ls||te===hs||te===_l||te===Sl,xe=Ee.getClearColor(),ge=Ee.getClearAlpha(),Ie=xe.r,Oe=xe.g,Re=xe.b;de?(g[0]=Ie,g[1]=Oe,g[2]=Re,g[3]=ge,C.clearBufferuiv(C.COLOR,0,g)):(y[0]=Ie,y[1]=Oe,y[2]=Re,y[3]=ge,C.clearBufferiv(C.COLOR,0,y))}else z|=C.COLOR_BUFFER_BIT}O&&(z|=C.DEPTH_BUFFER_BIT),B&&(z|=C.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),C.clear(z)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener("webglcontextlost",le,!1),t.removeEventListener("webglcontextrestored",ye,!1),t.removeEventListener("webglcontextcreationerror",Q,!1),Ee.dispose(),G.dispose(),Ae.dispose(),Se.dispose(),Nt.dispose(),Mt.dispose(),F.dispose(),he.dispose(),Ve.dispose(),q.dispose(),ie.dispose(),ie.removeEventListener("sessionstart",Vn),ie.removeEventListener("sessionend",Wu),Gi.stop()};function le(S){S.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),E=!0}function ye(){console.log("THREE.WebGLRenderer: Context Restored."),E=!1;let S=yt.autoReset,O=we.enabled,B=we.autoUpdate,z=we.needsUpdate,U=we.type;D(),yt.autoReset=S,we.enabled=O,we.autoUpdate=B,we.needsUpdate=z,we.type=U}function Q(S){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",S.statusMessage)}function J(S){let O=S.target;O.removeEventListener("dispose",J),be(O)}function be(S){Fe(S),Se.remove(S)}function Fe(S){let O=Se.get(S).programs;O!==void 0&&(O.forEach(function(B){q.releaseProgram(B)}),S.isShaderMaterial&&q.releaseShaderCache(S))}this.renderBufferDirect=function(S,O,B,z,U,te){O===null&&(O=ue);let de=U.isMesh&&U.matrixWorld.determinant()<0,xe=Bm(S,O,B,z,U);_e.setMaterial(z,de);let ge=B.index,Ie=1;if(z.wireframe===!0){if(ge=x.getWireframeAttribute(B),ge===void 0)return;Ie=2}let Oe=B.drawRange,Re=B.attributes.position,Ye=Oe.start*Ie,ot=(Oe.start+Oe.count)*Ie;te!==null&&(Ye=Math.max(Ye,te.start*Ie),ot=Math.min(ot,(te.start+te.count)*Ie)),ge!==null?(Ye=Math.max(Ye,0),ot=Math.min(ot,ge.count)):Re!=null&&(Ye=Math.max(Ye,0),ot=Math.min(ot,Re.count));let _t=ot-Ye;if(_t<0||_t===1/0)return;he.setup(U,z,xe,B,ge);let pt,ht=fe;if(ge!==null&&(pt=T.get(ge),ht=De,ht.setIndex(pt)),U.isMesh)z.wireframe===!0?(_e.setLineWidth(z.wireframeLinewidth*Ct()),ht.setMode(C.LINES)):ht.setMode(C.TRIANGLES);else if(U.isLine){let Pe=z.linewidth;Pe===void 0&&(Pe=1),_e.setLineWidth(Pe*Ct()),U.isLineSegments?ht.setMode(C.LINES):U.isLineLoop?ht.setMode(C.LINE_LOOP):ht.setMode(C.LINE_STRIP)}else U.isPoints?ht.setMode(C.POINTS):U.isSprite&&ht.setMode(C.TRIANGLES);if(U.isBatchedMesh)if(U._multiDrawInstances!==null)Qr("THREE.WebGLRenderer: renderMultiDrawInstances has been deprecated and will be removed in r184. Append to renderMultiDraw arguments and use indirection."),ht.renderMultiDrawInstances(U._multiDrawStarts,U._multiDrawCounts,U._multiDrawCount,U._multiDrawInstances);else if(Be.get("WEBGL_multi_draw"))ht.renderMultiDraw(U._multiDrawStarts,U._multiDrawCounts,U._multiDrawCount);else{let Pe=U._multiDrawStarts,vt=U._multiDrawCounts,et=U._multiDrawCount,cn=ge?T.get(ge).bytesPerElement:1,Sr=Se.get(z).currentProgram.getUniforms();for(let hn=0;hn<et;hn++)Sr.setValue(C,"_gl_DrawID",hn),ht.render(Pe[hn]/cn,vt[hn])}else if(U.isInstancedMesh)ht.renderInstances(Ye,_t,U.count);else if(B.isInstancedBufferGeometry){let Pe=B._maxInstanceCount!==void 0?B._maxInstanceCount:1/0,vt=Math.min(B.instanceCount,Pe);ht.renderInstances(Ye,_t,vt)}else ht.render(Ye,_t)};function ft(S,O,B){S.transparent===!0&&S.side===An&&S.forceSinglePass===!1?(S.side=en,S.needsUpdate=!0,La(S,O,B),S.side=hi,S.needsUpdate=!0,La(S,O,B),S.side=An):La(S,O,B)}this.compile=function(S,O,B=null){B===null&&(B=S),p=Ae.get(B),p.init(O),_.push(p),B.traverseVisible(function(U){U.isLight&&U.layers.test(O.layers)&&(p.pushLight(U),U.castShadow&&p.pushShadow(U))}),S!==B&&S.traverseVisible(function(U){U.isLight&&U.layers.test(O.layers)&&(p.pushLight(U),U.castShadow&&p.pushShadow(U))}),p.setupLights();let z=new Set;return S.traverse(function(U){if(!(U.isMesh||U.isPoints||U.isLine||U.isSprite))return;let te=U.material;if(te)if(Array.isArray(te))for(let de=0;de<te.length;de++){let xe=te[de];ft(xe,B,U),z.add(xe)}else ft(te,B,U),z.add(te)}),p=_.pop(),z},this.compileAsync=function(S,O,B=null){let z=this.compile(S,O,B);return new Promise(U=>{function te(){if(z.forEach(function(de){Se.get(de).currentProgram.isReady()&&z.delete(de)}),z.size===0){U(S);return}setTimeout(te,10)}Be.get("KHR_parallel_shader_compile")!==null?te():setTimeout(te,10)})};let nt=null;function Qn(S){nt&&nt(S)}function Vn(){Gi.stop()}function Wu(){Gi.start()}let Gi=new qp;Gi.setAnimationLoop(Qn),typeof self<"u"&&Gi.setContext(self),this.setAnimationLoop=function(S){nt=S,ie.setAnimationLoop(S),S===null?Gi.stop():Gi.start()},ie.addEventListener("sessionstart",Vn),ie.addEventListener("sessionend",Wu),this.render=function(S,O){if(O!==void 0&&O.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(E===!0)return;if(S.matrixWorldAutoUpdate===!0&&S.updateMatrixWorld(),O.parent===null&&O.matrixWorldAutoUpdate===!0&&O.updateMatrixWorld(),ie.enabled===!0&&ie.isPresenting===!0&&(ie.cameraAutoUpdate===!0&&ie.updateCamera(O),O=ie.getCamera()),S.isScene===!0&&S.onBeforeRender(v,S,O,k),p=Ae.get(S,_.length),p.init(O),_.push(p),Z.multiplyMatrices(O.projectionMatrix,O.matrixWorldInverse),Ue.setFromProjectionMatrix(Z,kn,O.reversedDepth),$=this.localClippingEnabled,qe=ae.init(this.clippingPlanes,$),m=G.get(S,b.length),m.init(),b.push(m),ie.enabled===!0&&ie.isPresenting===!0){let te=v.xr.getDepthSensingMesh();te!==null&&Tc(te,O,-1/0,v.sortObjects)}Tc(S,O,0,v.sortObjects),m.finish(),v.sortObjects===!0&&m.sort(oe,ee),Ze=ie.enabled===!1||ie.isPresenting===!1||ie.hasDepthSensing()===!1,Ze&&Ee.addToRenderList(m,S),this.info.render.frame++,qe===!0&&ae.beginShadows();let B=p.state.shadowsArray;we.render(B,S,O),qe===!0&&ae.endShadows(),this.info.autoReset===!0&&this.info.reset();let z=m.opaque,U=m.transmissive;if(p.setupLights(),O.isArrayCamera){let te=O.cameras;if(U.length>0)for(let de=0,xe=te.length;de<xe;de++){let ge=te[de];Xu(z,U,S,ge)}Ze&&Ee.render(S);for(let de=0,xe=te.length;de<xe;de++){let ge=te[de];$u(m,S,ge,ge.viewport)}}else U.length>0&&Xu(z,U,S,O),Ze&&Ee.render(S),$u(m,S,O);k!==null&&P===0&&(He.updateMultisampleRenderTarget(k),He.updateRenderTargetMipmap(k)),S.isScene===!0&&S.onAfterRender(v,S,O),he.resetDefaultState(),w=-1,M=null,_.pop(),_.length>0?(p=_[_.length-1],qe===!0&&ae.setGlobalState(v.clippingPlanes,p.state.camera)):p=null,b.pop(),b.length>0?m=b[b.length-1]:m=null};function Tc(S,O,B,z){if(S.visible===!1)return;if(S.layers.test(O.layers)){if(S.isGroup)B=S.renderOrder;else if(S.isLOD)S.autoUpdate===!0&&S.update(O);else if(S.isLight)p.pushLight(S),S.castShadow&&p.pushShadow(S);else if(S.isSprite){if(!S.frustumCulled||Ue.intersectsSprite(S)){z&&ve.setFromMatrixPosition(S.matrixWorld).applyMatrix4(Z);let de=F.update(S),xe=S.material;xe.visible&&m.push(S,de,xe,B,ve.z,null)}}else if((S.isMesh||S.isLine||S.isPoints)&&(!S.frustumCulled||Ue.intersectsObject(S))){let de=F.update(S),xe=S.material;if(z&&(S.boundingSphere!==void 0?(S.boundingSphere===null&&S.computeBoundingSphere(),ve.copy(S.boundingSphere.center)):(de.boundingSphere===null&&de.computeBoundingSphere(),ve.copy(de.boundingSphere.center)),ve.applyMatrix4(S.matrixWorld).applyMatrix4(Z)),Array.isArray(xe)){let ge=de.groups;for(let Ie=0,Oe=ge.length;Ie<Oe;Ie++){let Re=ge[Ie],Ye=xe[Re.materialIndex];Ye&&Ye.visible&&m.push(S,de,Ye,B,ve.z,Re)}}else xe.visible&&m.push(S,de,xe,B,ve.z,null)}}let te=S.children;for(let de=0,xe=te.length;de<xe;de++)Tc(te[de],O,B,z)}function $u(S,O,B,z){let U=S.opaque,te=S.transmissive,de=S.transparent;p.setupLightsView(B),qe===!0&&ae.setGlobalState(v.clippingPlanes,B),z&&_e.viewport(L.copy(z)),U.length>0&&Ia(U,O,B),te.length>0&&Ia(te,O,B),de.length>0&&Ia(de,O,B),_e.buffers.depth.setTest(!0),_e.buffers.depth.setMask(!0),_e.buffers.color.setMask(!0),_e.setPolygonOffset(!1)}function Xu(S,O,B,z){if((B.isScene===!0?B.overrideMaterial:null)!==null)return;p.state.transmissionRenderTarget[z.id]===void 0&&(p.state.transmissionRenderTarget[z.id]=new En(1,1,{generateMipmaps:!0,type:Be.has("EXT_color_buffer_half_float")||Be.has("EXT_color_buffer_float")?cs:jn,minFilter:Ui,samples:4,stencilBuffer:s,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:Ke.workingColorSpace}));let te=p.state.transmissionRenderTarget[z.id],de=z.viewport||L;te.setSize(de.z*v.transmissionResolutionScale,de.w*v.transmissionResolutionScale);let xe=v.getRenderTarget(),ge=v.getActiveCubeFace(),Ie=v.getActiveMipmapLevel();v.setRenderTarget(te),v.getClearColor(Y),j=v.getClearAlpha(),j<1&&v.setClearColor(16777215,.5),v.clear(),Ze&&Ee.render(B);let Oe=v.toneMapping;v.toneMapping=fi;let Re=z.viewport;if(z.viewport!==void 0&&(z.viewport=void 0),p.setupLightsView(z),qe===!0&&ae.setGlobalState(v.clippingPlanes,z),Ia(S,B,z),He.updateMultisampleRenderTarget(te),He.updateRenderTargetMipmap(te),Be.has("WEBGL_multisampled_render_to_texture")===!1){let Ye=!1;for(let ot=0,_t=O.length;ot<_t;ot++){let pt=O[ot],ht=pt.object,Pe=pt.geometry,vt=pt.material,et=pt.group;if(vt.side===An&&ht.layers.test(z.layers)){let cn=vt.side;vt.side=en,vt.needsUpdate=!0,qu(ht,B,z,Pe,vt,et),vt.side=cn,vt.needsUpdate=!0,Ye=!0}}Ye===!0&&(He.updateMultisampleRenderTarget(te),He.updateRenderTargetMipmap(te))}v.setRenderTarget(xe,ge,Ie),v.setClearColor(Y,j),Re!==void 0&&(z.viewport=Re),v.toneMapping=Oe}function Ia(S,O,B){let z=O.isScene===!0?O.overrideMaterial:null;for(let U=0,te=S.length;U<te;U++){let de=S[U],xe=de.object,ge=de.geometry,Ie=de.group,Oe=de.material;Oe.allowOverride===!0&&z!==null&&(Oe=z),xe.layers.test(B.layers)&&qu(xe,O,B,ge,Oe,Ie)}}function qu(S,O,B,z,U,te){S.onBeforeRender(v,O,B,z,U,te),S.modelViewMatrix.multiplyMatrices(B.matrixWorldInverse,S.matrixWorld),S.normalMatrix.getNormalMatrix(S.modelViewMatrix),U.onBeforeRender(v,O,B,z,S,te),U.transparent===!0&&U.side===An&&U.forceSinglePass===!1?(U.side=en,U.needsUpdate=!0,v.renderBufferDirect(B,O,z,U,S,te),U.side=hi,U.needsUpdate=!0,v.renderBufferDirect(B,O,z,U,S,te),U.side=An):v.renderBufferDirect(B,O,z,U,S,te),S.onAfterRender(v,O,B,z,U,te)}function La(S,O,B){O.isScene!==!0&&(O=ue);let z=Se.get(S),U=p.state.lights,te=p.state.shadowsArray,de=U.state.version,xe=q.getParameters(S,U.state,te,O,B),ge=q.getProgramCacheKey(xe),Ie=z.programs;z.environment=S.isMeshStandardMaterial?O.environment:null,z.fog=O.fog,z.envMap=(S.isMeshStandardMaterial?Mt:Nt).get(S.envMap||z.environment),z.envMapRotation=z.environment!==null&&S.envMap===null?O.environmentRotation:S.envMapRotation,Ie===void 0&&(S.addEventListener("dispose",J),Ie=new Map,z.programs=Ie);let Oe=Ie.get(ge);if(Oe!==void 0){if(z.currentProgram===Oe&&z.lightsStateVersion===de)return ju(S,xe),Oe}else xe.uniforms=q.getUniforms(S),S.onBeforeCompile(xe,v),Oe=q.acquireProgram(xe,ge),Ie.set(ge,Oe),z.uniforms=xe.uniforms;let Re=z.uniforms;return(!S.isShaderMaterial&&!S.isRawShaderMaterial||S.clipping===!0)&&(Re.clippingPlanes=ae.uniform),ju(S,xe),z.needsLights=Vm(S),z.lightsStateVersion=de,z.needsLights&&(Re.ambientLightColor.value=U.state.ambient,Re.lightProbe.value=U.state.probe,Re.directionalLights.value=U.state.directional,Re.directionalLightShadows.value=U.state.directionalShadow,Re.spotLights.value=U.state.spot,Re.spotLightShadows.value=U.state.spotShadow,Re.rectAreaLights.value=U.state.rectArea,Re.ltc_1.value=U.state.rectAreaLTC1,Re.ltc_2.value=U.state.rectAreaLTC2,Re.pointLights.value=U.state.point,Re.pointLightShadows.value=U.state.pointShadow,Re.hemisphereLights.value=U.state.hemi,Re.directionalShadowMap.value=U.state.directionalShadowMap,Re.directionalShadowMatrix.value=U.state.directionalShadowMatrix,Re.spotShadowMap.value=U.state.spotShadowMap,Re.spotLightMatrix.value=U.state.spotLightMatrix,Re.spotLightMap.value=U.state.spotLightMap,Re.pointShadowMap.value=U.state.pointShadowMap,Re.pointShadowMatrix.value=U.state.pointShadowMatrix),z.currentProgram=Oe,z.uniformsList=null,Oe}function Yu(S){if(S.uniformsList===null){let O=S.currentProgram.getUniforms();S.uniformsList=ps.seqWithValue(O.seq,S.uniforms)}return S.uniformsList}function ju(S,O){let B=Se.get(S);B.outputColorSpace=O.outputColorSpace,B.batching=O.batching,B.batchingColor=O.batchingColor,B.instancing=O.instancing,B.instancingColor=O.instancingColor,B.instancingMorph=O.instancingMorph,B.skinning=O.skinning,B.morphTargets=O.morphTargets,B.morphNormals=O.morphNormals,B.morphColors=O.morphColors,B.morphTargetsCount=O.morphTargetsCount,B.numClippingPlanes=O.numClippingPlanes,B.numIntersection=O.numClipIntersection,B.vertexAlphas=O.vertexAlphas,B.vertexTangents=O.vertexTangents,B.toneMapping=O.toneMapping}function Bm(S,O,B,z,U){O.isScene!==!0&&(O=ue),He.resetTextureUnits();let te=O.fog,de=z.isMeshStandardMaterial?O.environment:null,xe=k===null?v.outputColorSpace:k.isXRRenderTarget===!0?k.texture.colorSpace:ui,ge=(z.isMeshStandardMaterial?Mt:Nt).get(z.envMap||de),Ie=z.vertexColors===!0&&!!B.attributes.color&&B.attributes.color.itemSize===4,Oe=!!B.attributes.tangent&&(!!z.normalMap||z.anisotropy>0),Re=!!B.morphAttributes.position,Ye=!!B.morphAttributes.normal,ot=!!B.morphAttributes.color,_t=fi;z.toneMapped&&(k===null||k.isXRRenderTarget===!0)&&(_t=v.toneMapping);let pt=B.morphAttributes.position||B.morphAttributes.normal||B.morphAttributes.color,ht=pt!==void 0?pt.length:0,Pe=Se.get(z),vt=p.state.lights;if(qe===!0&&($===!0||S!==M)){let Jt=S===M&&z.id===w;ae.setState(z,S,Jt)}let et=!1;z.version===Pe.__version?(Pe.needsLights&&Pe.lightsStateVersion!==vt.state.version||Pe.outputColorSpace!==xe||U.isBatchedMesh&&Pe.batching===!1||!U.isBatchedMesh&&Pe.batching===!0||U.isBatchedMesh&&Pe.batchingColor===!0&&U.colorTexture===null||U.isBatchedMesh&&Pe.batchingColor===!1&&U.colorTexture!==null||U.isInstancedMesh&&Pe.instancing===!1||!U.isInstancedMesh&&Pe.instancing===!0||U.isSkinnedMesh&&Pe.skinning===!1||!U.isSkinnedMesh&&Pe.skinning===!0||U.isInstancedMesh&&Pe.instancingColor===!0&&U.instanceColor===null||U.isInstancedMesh&&Pe.instancingColor===!1&&U.instanceColor!==null||U.isInstancedMesh&&Pe.instancingMorph===!0&&U.morphTexture===null||U.isInstancedMesh&&Pe.instancingMorph===!1&&U.morphTexture!==null||Pe.envMap!==ge||z.fog===!0&&Pe.fog!==te||Pe.numClippingPlanes!==void 0&&(Pe.numClippingPlanes!==ae.numPlanes||Pe.numIntersection!==ae.numIntersection)||Pe.vertexAlphas!==Ie||Pe.vertexTangents!==Oe||Pe.morphTargets!==Re||Pe.morphNormals!==Ye||Pe.morphColors!==ot||Pe.toneMapping!==_t||Pe.morphTargetsCount!==ht)&&(et=!0):(et=!0,Pe.__version=z.version);let cn=Pe.currentProgram;et===!0&&(cn=La(z,O,U));let Sr=!1,hn=!1,Ms=!1,xt=cn.getUniforms(),vn=Pe.uniforms;if(_e.useProgram(cn.program)&&(Sr=!0,hn=!0,Ms=!0),z.id!==w&&(w=z.id,hn=!0),Sr||M!==S){_e.buffers.depth.getReversed()&&S.reversedDepth!==!0&&(S._reversedDepth=!0,S.updateProjectionMatrix()),xt.setValue(C,"projectionMatrix",S.projectionMatrix),xt.setValue(C,"viewMatrix",S.matrixWorldInverse);let tn=xt.map.cameraPosition;tn!==void 0&&tn.setValue(C,me.setFromMatrixPosition(S.matrixWorld)),Ne.logarithmicDepthBuffer&&xt.setValue(C,"logDepthBufFC",2/(Math.log(S.far+1)/Math.LN2)),(z.isMeshPhongMaterial||z.isMeshToonMaterial||z.isMeshLambertMaterial||z.isMeshBasicMaterial||z.isMeshStandardMaterial||z.isShaderMaterial)&&xt.setValue(C,"isOrthographic",S.isOrthographicCamera===!0),M!==S&&(M=S,hn=!0,Ms=!0)}if(U.isSkinnedMesh){xt.setOptional(C,U,"bindMatrix"),xt.setOptional(C,U,"bindMatrixInverse");let Jt=U.skeleton;Jt&&(Jt.boneTexture===null&&Jt.computeBoneTexture(),xt.setValue(C,"boneTexture",Jt.boneTexture,He))}U.isBatchedMesh&&(xt.setOptional(C,U,"batchingTexture"),xt.setValue(C,"batchingTexture",U._matricesTexture,He),xt.setOptional(C,U,"batchingIdTexture"),xt.setValue(C,"batchingIdTexture",U._indirectTexture,He),xt.setOptional(C,U,"batchingColorTexture"),U._colorsTexture!==null&&xt.setValue(C,"batchingColorTexture",U._colorsTexture,He));let xn=B.morphAttributes;if((xn.position!==void 0||xn.normal!==void 0||xn.color!==void 0)&&ne.update(U,B,cn),(hn||Pe.receiveShadow!==U.receiveShadow)&&(Pe.receiveShadow=U.receiveShadow,xt.setValue(C,"receiveShadow",U.receiveShadow)),z.isMeshGouraudMaterial&&z.envMap!==null&&(vn.envMap.value=ge,vn.flipEnvMap.value=ge.isCubeTexture&&ge.isRenderTargetTexture===!1?-1:1),z.isMeshStandardMaterial&&z.envMap===null&&O.environment!==null&&(vn.envMapIntensity.value=O.environmentIntensity),hn&&(xt.setValue(C,"toneMappingExposure",v.toneMappingExposure),Pe.needsLights&&zm(vn,Ms),te&&z.fog===!0&&K.refreshFogUniforms(vn,te),K.refreshMaterialUniforms(vn,z,H,re,p.state.transmissionRenderTarget[S.id]),ps.upload(C,Yu(Pe),vn,He)),z.isShaderMaterial&&z.uniformsNeedUpdate===!0&&(ps.upload(C,Yu(Pe),vn,He),z.uniformsNeedUpdate=!1),z.isSpriteMaterial&&xt.setValue(C,"center",U.center),xt.setValue(C,"modelViewMatrix",U.modelViewMatrix),xt.setValue(C,"normalMatrix",U.normalMatrix),xt.setValue(C,"modelMatrix",U.matrixWorld),z.isShaderMaterial||z.isRawShaderMaterial){let Jt=z.uniformsGroups;for(let tn=0,Ac=Jt.length;tn<Ac;tn++){let Wi=Jt[tn];Ve.update(Wi,cn),Ve.bind(Wi,cn)}}return cn}function zm(S,O){S.ambientLightColor.needsUpdate=O,S.lightProbe.needsUpdate=O,S.directionalLights.needsUpdate=O,S.directionalLightShadows.needsUpdate=O,S.pointLights.needsUpdate=O,S.pointLightShadows.needsUpdate=O,S.spotLights.needsUpdate=O,S.spotLightShadows.needsUpdate=O,S.rectAreaLights.needsUpdate=O,S.hemisphereLights.needsUpdate=O}function Vm(S){return S.isMeshLambertMaterial||S.isMeshToonMaterial||S.isMeshPhongMaterial||S.isMeshStandardMaterial||S.isShadowMaterial||S.isShaderMaterial&&S.lights===!0}this.getActiveCubeFace=function(){return A},this.getActiveMipmapLevel=function(){return P},this.getRenderTarget=function(){return k},this.setRenderTargetTextures=function(S,O,B){let z=Se.get(S);z.__autoAllocateDepthBuffer=S.resolveDepthBuffer===!1,z.__autoAllocateDepthBuffer===!1&&(z.__useRenderToTexture=!1),Se.get(S.texture).__webglTexture=O,Se.get(S.depthTexture).__webglTexture=z.__autoAllocateDepthBuffer?void 0:B,z.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(S,O){let B=Se.get(S);B.__webglFramebuffer=O,B.__useDefaultFramebuffer=O===void 0};let Hm=C.createFramebuffer();this.setRenderTarget=function(S,O=0,B=0){k=S,A=O,P=B;let z=!0,U=null,te=!1,de=!1;if(S){let ge=Se.get(S);if(ge.__useDefaultFramebuffer!==void 0)_e.bindFramebuffer(C.FRAMEBUFFER,null),z=!1;else if(ge.__webglFramebuffer===void 0)He.setupRenderTarget(S);else if(ge.__hasExternalTextures)He.rebindTextures(S,Se.get(S.texture).__webglTexture,Se.get(S.depthTexture).__webglTexture);else if(S.depthBuffer){let Re=S.depthTexture;if(ge.__boundDepthTexture!==Re){if(Re!==null&&Se.has(Re)&&(S.width!==Re.image.width||S.height!==Re.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");He.setupDepthRenderbuffer(S)}}let Ie=S.texture;(Ie.isData3DTexture||Ie.isDataArrayTexture||Ie.isCompressedArrayTexture)&&(de=!0);let Oe=Se.get(S).__webglFramebuffer;S.isWebGLCubeRenderTarget?(Array.isArray(Oe[O])?U=Oe[O][B]:U=Oe[O],te=!0):S.samples>0&&He.useMultisampledRTT(S)===!1?U=Se.get(S).__webglMultisampledFramebuffer:Array.isArray(Oe)?U=Oe[B]:U=Oe,L.copy(S.viewport),V.copy(S.scissor),W=S.scissorTest}else L.copy(Me).multiplyScalar(H).floor(),V.copy($e).multiplyScalar(H).floor(),W=rt;if(B!==0&&(U=Hm),_e.bindFramebuffer(C.FRAMEBUFFER,U)&&z&&_e.drawBuffers(S,U),_e.viewport(L),_e.scissor(V),_e.setScissorTest(W),te){let ge=Se.get(S.texture);C.framebufferTexture2D(C.FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_CUBE_MAP_POSITIVE_X+O,ge.__webglTexture,B)}else if(de){let ge=O;for(let Ie=0;Ie<S.textures.length;Ie++){let Oe=Se.get(S.textures[Ie]);C.framebufferTextureLayer(C.FRAMEBUFFER,C.COLOR_ATTACHMENT0+Ie,Oe.__webglTexture,B,ge)}}else if(S!==null&&B!==0){let ge=Se.get(S.texture);C.framebufferTexture2D(C.FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_2D,ge.__webglTexture,B)}w=-1},this.readRenderTargetPixels=function(S,O,B,z,U,te,de,xe=0){if(!(S&&S.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let ge=Se.get(S).__webglFramebuffer;if(S.isWebGLCubeRenderTarget&&de!==void 0&&(ge=ge[de]),ge){_e.bindFramebuffer(C.FRAMEBUFFER,ge);try{let Ie=S.textures[xe],Oe=Ie.format,Re=Ie.type;if(!Ne.textureFormatReadable(Oe)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!Ne.textureTypeReadable(Re)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}O>=0&&O<=S.width-z&&B>=0&&B<=S.height-U&&(S.textures.length>1&&C.readBuffer(C.COLOR_ATTACHMENT0+xe),C.readPixels(O,B,z,U,Te.convert(Oe),Te.convert(Re),te))}finally{let Ie=k!==null?Se.get(k).__webglFramebuffer:null;_e.bindFramebuffer(C.FRAMEBUFFER,Ie)}}},this.readRenderTargetPixelsAsync=async function(S,O,B,z,U,te,de,xe=0){if(!(S&&S.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let ge=Se.get(S).__webglFramebuffer;if(S.isWebGLCubeRenderTarget&&de!==void 0&&(ge=ge[de]),ge)if(O>=0&&O<=S.width-z&&B>=0&&B<=S.height-U){_e.bindFramebuffer(C.FRAMEBUFFER,ge);let Ie=S.textures[xe],Oe=Ie.format,Re=Ie.type;if(!Ne.textureFormatReadable(Oe))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!Ne.textureTypeReadable(Re))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let Ye=C.createBuffer();C.bindBuffer(C.PIXEL_PACK_BUFFER,Ye),C.bufferData(C.PIXEL_PACK_BUFFER,te.byteLength,C.STREAM_READ),S.textures.length>1&&C.readBuffer(C.COLOR_ATTACHMENT0+xe),C.readPixels(O,B,z,U,Te.convert(Oe),Te.convert(Re),0);let ot=k!==null?Se.get(k).__webglFramebuffer:null;_e.bindFramebuffer(C.FRAMEBUFFER,ot);let _t=C.fenceSync(C.SYNC_GPU_COMMANDS_COMPLETE,0);return C.flush(),await bp(C,_t,4),C.bindBuffer(C.PIXEL_PACK_BUFFER,Ye),C.getBufferSubData(C.PIXEL_PACK_BUFFER,0,te),C.deleteBuffer(Ye),C.deleteSync(_t),te}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(S,O=null,B=0){let z=Math.pow(2,-B),U=Math.floor(S.image.width*z),te=Math.floor(S.image.height*z),de=O!==null?O.x:0,xe=O!==null?O.y:0;He.setTexture2D(S,0),C.copyTexSubImage2D(C.TEXTURE_2D,B,0,0,de,xe,U,te),_e.unbindTexture()};let Gm=C.createFramebuffer(),Wm=C.createFramebuffer();this.copyTextureToTexture=function(S,O,B=null,z=null,U=0,te=null){te===null&&(U!==0?(Qr("WebGLRenderer: copyTextureToTexture function signature has changed to support src and dst mipmap levels."),te=U,U=0):te=0);let de,xe,ge,Ie,Oe,Re,Ye,ot,_t,pt=S.isCompressedTexture?S.mipmaps[te]:S.image;if(B!==null)de=B.max.x-B.min.x,xe=B.max.y-B.min.y,ge=B.isBox3?B.max.z-B.min.z:1,Ie=B.min.x,Oe=B.min.y,Re=B.isBox3?B.min.z:0;else{let xn=Math.pow(2,-U);de=Math.floor(pt.width*xn),xe=Math.floor(pt.height*xn),S.isDataArrayTexture?ge=pt.depth:S.isData3DTexture?ge=Math.floor(pt.depth*xn):ge=1,Ie=0,Oe=0,Re=0}z!==null?(Ye=z.x,ot=z.y,_t=z.z):(Ye=0,ot=0,_t=0);let ht=Te.convert(O.format),Pe=Te.convert(O.type),vt;O.isData3DTexture?(He.setTexture3D(O,0),vt=C.TEXTURE_3D):O.isDataArrayTexture||O.isCompressedArrayTexture?(He.setTexture2DArray(O,0),vt=C.TEXTURE_2D_ARRAY):(He.setTexture2D(O,0),vt=C.TEXTURE_2D),C.pixelStorei(C.UNPACK_FLIP_Y_WEBGL,O.flipY),C.pixelStorei(C.UNPACK_PREMULTIPLY_ALPHA_WEBGL,O.premultiplyAlpha),C.pixelStorei(C.UNPACK_ALIGNMENT,O.unpackAlignment);let et=C.getParameter(C.UNPACK_ROW_LENGTH),cn=C.getParameter(C.UNPACK_IMAGE_HEIGHT),Sr=C.getParameter(C.UNPACK_SKIP_PIXELS),hn=C.getParameter(C.UNPACK_SKIP_ROWS),Ms=C.getParameter(C.UNPACK_SKIP_IMAGES);C.pixelStorei(C.UNPACK_ROW_LENGTH,pt.width),C.pixelStorei(C.UNPACK_IMAGE_HEIGHT,pt.height),C.pixelStorei(C.UNPACK_SKIP_PIXELS,Ie),C.pixelStorei(C.UNPACK_SKIP_ROWS,Oe),C.pixelStorei(C.UNPACK_SKIP_IMAGES,Re);let xt=S.isDataArrayTexture||S.isData3DTexture,vn=O.isDataArrayTexture||O.isData3DTexture;if(S.isDepthTexture){let xn=Se.get(S),Jt=Se.get(O),tn=Se.get(xn.__renderTarget),Ac=Se.get(Jt.__renderTarget);_e.bindFramebuffer(C.READ_FRAMEBUFFER,tn.__webglFramebuffer),_e.bindFramebuffer(C.DRAW_FRAMEBUFFER,Ac.__webglFramebuffer);for(let Wi=0;Wi<ge;Wi++)xt&&(C.framebufferTextureLayer(C.READ_FRAMEBUFFER,C.COLOR_ATTACHMENT0,Se.get(S).__webglTexture,U,Re+Wi),C.framebufferTextureLayer(C.DRAW_FRAMEBUFFER,C.COLOR_ATTACHMENT0,Se.get(O).__webglTexture,te,_t+Wi)),C.blitFramebuffer(Ie,Oe,de,xe,Ye,ot,de,xe,C.DEPTH_BUFFER_BIT,C.NEAREST);_e.bindFramebuffer(C.READ_FRAMEBUFFER,null),_e.bindFramebuffer(C.DRAW_FRAMEBUFFER,null)}else if(U!==0||S.isRenderTargetTexture||Se.has(S)){let xn=Se.get(S),Jt=Se.get(O);_e.bindFramebuffer(C.READ_FRAMEBUFFER,Gm),_e.bindFramebuffer(C.DRAW_FRAMEBUFFER,Wm);for(let tn=0;tn<ge;tn++)xt?C.framebufferTextureLayer(C.READ_FRAMEBUFFER,C.COLOR_ATTACHMENT0,xn.__webglTexture,U,Re+tn):C.framebufferTexture2D(C.READ_FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_2D,xn.__webglTexture,U),vn?C.framebufferTextureLayer(C.DRAW_FRAMEBUFFER,C.COLOR_ATTACHMENT0,Jt.__webglTexture,te,_t+tn):C.framebufferTexture2D(C.DRAW_FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_2D,Jt.__webglTexture,te),U!==0?C.blitFramebuffer(Ie,Oe,de,xe,Ye,ot,de,xe,C.COLOR_BUFFER_BIT,C.NEAREST):vn?C.copyTexSubImage3D(vt,te,Ye,ot,_t+tn,Ie,Oe,de,xe):C.copyTexSubImage2D(vt,te,Ye,ot,Ie,Oe,de,xe);_e.bindFramebuffer(C.READ_FRAMEBUFFER,null),_e.bindFramebuffer(C.DRAW_FRAMEBUFFER,null)}else vn?S.isDataTexture||S.isData3DTexture?C.texSubImage3D(vt,te,Ye,ot,_t,de,xe,ge,ht,Pe,pt.data):O.isCompressedArrayTexture?C.compressedTexSubImage3D(vt,te,Ye,ot,_t,de,xe,ge,ht,pt.data):C.texSubImage3D(vt,te,Ye,ot,_t,de,xe,ge,ht,Pe,pt):S.isDataTexture?C.texSubImage2D(C.TEXTURE_2D,te,Ye,ot,de,xe,ht,Pe,pt.data):S.isCompressedTexture?C.compressedTexSubImage2D(C.TEXTURE_2D,te,Ye,ot,pt.width,pt.height,ht,pt.data):C.texSubImage2D(C.TEXTURE_2D,te,Ye,ot,de,xe,ht,Pe,pt);C.pixelStorei(C.UNPACK_ROW_LENGTH,et),C.pixelStorei(C.UNPACK_IMAGE_HEIGHT,cn),C.pixelStorei(C.UNPACK_SKIP_PIXELS,Sr),C.pixelStorei(C.UNPACK_SKIP_ROWS,hn),C.pixelStorei(C.UNPACK_SKIP_IMAGES,Ms),te===0&&O.generateMipmaps&&C.generateMipmap(vt),_e.unbindTexture()},this.initRenderTarget=function(S){Se.get(S).__webglFramebuffer===void 0&&He.setupRenderTarget(S)},this.initTexture=function(S){S.isCubeTexture?He.setTextureCube(S,0):S.isData3DTexture?He.setTexture3D(S,0):S.isDataArrayTexture||S.isCompressedArrayTexture?He.setTexture2DArray(S,0):He.setTexture2D(S,0),_e.unbindTexture()},this.resetState=function(){A=0,P=0,k=null,_e.reset(),he.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return kn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=Ke._getDrawingBufferColorSpace(e),t.unpackColorSpace=Ke._getUnpackColorSpace()}};var Kp={type:"change"},Cu={type:"start"},em={type:"end"},ac=new Di,Qp=new wn,cS=Math.cos(70*au.DEG2RAD),kt=new N,ln=2*Math.PI,ct={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},Au=1e-6,oc=class extends pa{constructor(e,t=null){super(e,t),this.state=ct.NONE,this.target=new N,this.cursor=new N,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:Tn.ROTATE,MIDDLE:Tn.DOLLY,RIGHT:Tn.PAN},this.touches={ONE:Fn.ROTATE,TWO:Fn.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._domElementKeyEvents=null,this._lastPosition=new N,this._lastQuaternion=new Mn,this._lastTargetPosition=new N,this._quat=new Mn().setFromUnitVectors(e.up,new N(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new os,this._sphericalDelta=new os,this._scale=1,this._panOffset=new N,this._rotateStart=new Le,this._rotateEnd=new Le,this._rotateDelta=new Le,this._panStart=new Le,this._panEnd=new Le,this._panDelta=new Le,this._dollyStart=new Le,this._dollyEnd=new Le,this._dollyDelta=new Le,this._dollyDirection=new N,this._mouse=new Le,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=uS.bind(this),this._onPointerDown=hS.bind(this),this._onPointerUp=dS.bind(this),this._onContextMenu=xS.bind(this),this._onMouseWheel=mS.bind(this),this._onKeyDown=gS.bind(this),this._onTouchStart=yS.bind(this),this._onTouchMove=vS.bind(this),this._onMouseDown=fS.bind(this),this._onMouseMove=pS.bind(this),this._interceptControlDown=bS.bind(this),this._interceptControlUp=_S.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}connect(e){super.connect(e),this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointercancel",this._onPointerUp),this.domElement.addEventListener("contextmenu",this._onContextMenu),this.domElement.addEventListener("wheel",this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener("keydown",this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction="none"}disconnect(){this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.domElement.removeEventListener("pointercancel",this._onPointerUp),this.domElement.removeEventListener("wheel",this._onMouseWheel),this.domElement.removeEventListener("contextmenu",this._onContextMenu),this.stopListenToKeyEvents(),this.domElement.getRootNode().removeEventListener("keydown",this._interceptControlDown,{capture:!0}),this.domElement.style.touchAction="auto"}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(e){e.addEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=e}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(Kp),this.update(),this.state=ct.NONE}update(e=null){let t=this.object.position;kt.copy(t).sub(this.target),kt.applyQuaternion(this._quat),this._spherical.setFromVector3(kt),this.autoRotate&&this.state===ct.NONE&&this._rotateLeft(this._getAutoRotationAngle(e)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let i=this.minAzimuthAngle,r=this.maxAzimuthAngle;isFinite(i)&&isFinite(r)&&(i<-Math.PI?i+=ln:i>Math.PI&&(i-=ln),r<-Math.PI?r+=ln:r>Math.PI&&(r-=ln),i<=r?this._spherical.theta=Math.max(i,Math.min(r,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(i+r)/2?Math.max(i,this._spherical.theta):Math.min(r,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let s=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{let a=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),s=a!=this._spherical.radius}if(kt.setFromSpherical(this._spherical),kt.applyQuaternion(this._quatInverse),t.copy(this.target).add(kt),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let a=null;if(this.object.isPerspectiveCamera){let o=kt.length();a=this._clampDistance(o*this._scale);let l=o-a;this.object.position.addScaledVector(this._dollyDirection,l),this.object.updateMatrixWorld(),s=!!l}else if(this.object.isOrthographicCamera){let o=new N(this._mouse.x,this._mouse.y,0);o.unproject(this.object);let l=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),s=l!==this.object.zoom;let c=new N(this._mouse.x,this._mouse.y,0);c.unproject(this.object),this.object.position.sub(c).add(o),this.object.updateMatrixWorld(),a=kt.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),this.zoomToCursor=!1;a!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(a).add(this.object.position):(ac.origin.copy(this.object.position),ac.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(ac.direction))<cS?this.object.lookAt(this.target):(Qp.setFromNormalAndCoplanarPoint(this.object.up,this.target),ac.intersectPlane(Qp,this.target))))}else if(this.object.isOrthographicCamera){let a=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),a!==this.object.zoom&&(this.object.updateProjectionMatrix(),s=!0)}return this._scale=1,this._performCursorZoom=!1,s||this._lastPosition.distanceToSquared(this.object.position)>Au||8*(1-this._lastQuaternion.dot(this.object.quaternion))>Au||this._lastTargetPosition.distanceToSquared(this.target)>Au?(this.dispatchEvent(Kp),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(e){return e!==null?ln/60*this.autoRotateSpeed*e:ln/60/60*this.autoRotateSpeed}_getZoomScale(e){let t=Math.abs(e*.01);return Math.pow(.95,this.zoomSpeed*t)}_rotateLeft(e){this._sphericalDelta.theta-=e}_rotateUp(e){this._sphericalDelta.phi-=e}_panLeft(e,t){kt.setFromMatrixColumn(t,0),kt.multiplyScalar(-e),this._panOffset.add(kt)}_panUp(e,t){this.screenSpacePanning===!0?kt.setFromMatrixColumn(t,1):(kt.setFromMatrixColumn(t,0),kt.crossVectors(this.object.up,kt)),kt.multiplyScalar(e),this._panOffset.add(kt)}_pan(e,t){let i=this.domElement;if(this.object.isPerspectiveCamera){let r=this.object.position;kt.copy(r).sub(this.target);let s=kt.length();s*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*e*s/i.clientHeight,this.object.matrix),this._panUp(2*t*s/i.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(e*(this.object.right-this.object.left)/this.object.zoom/i.clientWidth,this.object.matrix),this._panUp(t*(this.object.top-this.object.bottom)/this.object.zoom/i.clientHeight,this.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),this.enablePan=!1)}_dollyOut(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=e:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_dollyIn(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=e:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_updateZoomParameters(e,t){if(!this.zoomToCursor)return;this._performCursorZoom=!0;let i=this.domElement.getBoundingClientRect(),r=e-i.left,s=t-i.top,a=i.width,o=i.height;this._mouse.x=r/a*2-1,this._mouse.y=-(s/o)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(e){return Math.max(this.minDistance,Math.min(this.maxDistance,e))}_handleMouseDownRotate(e){this._rotateStart.set(e.clientX,e.clientY)}_handleMouseDownDolly(e){this._updateZoomParameters(e.clientX,e.clientX),this._dollyStart.set(e.clientX,e.clientY)}_handleMouseDownPan(e){this._panStart.set(e.clientX,e.clientY)}_handleMouseMoveRotate(e){this._rotateEnd.set(e.clientX,e.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(ln*this._rotateDelta.x/t.clientHeight),this._rotateUp(ln*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(e){this._dollyEnd.set(e.clientX,e.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(e){this._panEnd.set(e.clientX,e.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(e){this._updateZoomParameters(e.clientX,e.clientY),e.deltaY<0?this._dollyIn(this._getZoomScale(e.deltaY)):e.deltaY>0&&this._dollyOut(this._getZoomScale(e.deltaY)),this.update()}_handleKeyDown(e){let t=!1;switch(e.code){case this.keys.UP:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(ln*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),t=!0;break;case this.keys.BOTTOM:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(-ln*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),t=!0;break;case this.keys.LEFT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(ln*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),t=!0;break;case this.keys.RIGHT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(-ln*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),t=!0;break}t&&(e.preventDefault(),this.update())}_handleTouchStartRotate(e){if(this._pointers.length===1)this._rotateStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),i=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateStart.set(i,r)}}_handleTouchStartPan(e){if(this._pointers.length===1)this._panStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),i=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panStart.set(i,r)}}_handleTouchStartDolly(e){let t=this._getSecondPointerPosition(e),i=e.pageX-t.x,r=e.pageY-t.y,s=Math.sqrt(i*i+r*r);this._dollyStart.set(0,s)}_handleTouchStartDollyPan(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enablePan&&this._handleTouchStartPan(e)}_handleTouchStartDollyRotate(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enableRotate&&this._handleTouchStartRotate(e)}_handleTouchMoveRotate(e){if(this._pointers.length==1)this._rotateEnd.set(e.pageX,e.pageY);else{let i=this._getSecondPointerPosition(e),r=.5*(e.pageX+i.x),s=.5*(e.pageY+i.y);this._rotateEnd.set(r,s)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(ln*this._rotateDelta.x/t.clientHeight),this._rotateUp(ln*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(e){if(this._pointers.length===1)this._panEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),i=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panEnd.set(i,r)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(e){let t=this._getSecondPointerPosition(e),i=e.pageX-t.x,r=e.pageY-t.y,s=Math.sqrt(i*i+r*r);this._dollyEnd.set(0,s),this._dollyDelta.set(0,Math.pow(this._dollyEnd.y/this._dollyStart.y,this.zoomSpeed)),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);let a=(e.pageX+t.x)*.5,o=(e.pageY+t.y)*.5;this._updateZoomParameters(a,o)}_handleTouchMoveDollyPan(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enablePan&&this._handleTouchMovePan(e)}_handleTouchMoveDollyRotate(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enableRotate&&this._handleTouchMoveRotate(e)}_addPointer(e){this._pointers.push(e.pointerId)}_removePointer(e){delete this._pointerPositions[e.pointerId];for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId){this._pointers.splice(t,1);return}}_isTrackingPointer(e){for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId)return!0;return!1}_trackPointer(e){let t=this._pointerPositions[e.pointerId];t===void 0&&(t=new Le,this._pointerPositions[e.pointerId]=t),t.set(e.pageX,e.pageY)}_getSecondPointerPosition(e){let t=e.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[t]}_customWheelEvent(e){let t=e.deltaMode,i={clientX:e.clientX,clientY:e.clientY,deltaY:e.deltaY};switch(t){case 1:i.deltaY*=16;break;case 2:i.deltaY*=100;break}return e.ctrlKey&&!this._controlActive&&(i.deltaY*=10),i}};function hS(n){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(n.pointerId),this.domElement.addEventListener("pointermove",this._onPointerMove),this.domElement.addEventListener("pointerup",this._onPointerUp)),!this._isTrackingPointer(n)&&(this._addPointer(n),n.pointerType==="touch"?this._onTouchStart(n):this._onMouseDown(n)))}function uS(n){this.enabled!==!1&&(n.pointerType==="touch"?this._onTouchMove(n):this._onMouseMove(n))}function dS(n){switch(this._removePointer(n),this._pointers.length){case 0:this.domElement.releasePointerCapture(n.pointerId),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.dispatchEvent(em),this.state=ct.NONE;break;case 1:let e=this._pointers[0],t=this._pointerPositions[e];this._onTouchStart({pointerId:e,pageX:t.x,pageY:t.y});break}}function fS(n){let e;switch(n.button){case 0:e=this.mouseButtons.LEFT;break;case 1:e=this.mouseButtons.MIDDLE;break;case 2:e=this.mouseButtons.RIGHT;break;default:e=-1}switch(e){case Tn.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(n),this.state=ct.DOLLY;break;case Tn.ROTATE:if(n.ctrlKey||n.metaKey||n.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(n),this.state=ct.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(n),this.state=ct.ROTATE}break;case Tn.PAN:if(n.ctrlKey||n.metaKey||n.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(n),this.state=ct.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(n),this.state=ct.PAN}break;default:this.state=ct.NONE}this.state!==ct.NONE&&this.dispatchEvent(Cu)}function pS(n){switch(this.state){case ct.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(n);break;case ct.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(n);break;case ct.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(n);break}}function mS(n){this.enabled===!1||this.enableZoom===!1||this.state!==ct.NONE||(n.preventDefault(),this.dispatchEvent(Cu),this._handleMouseWheel(this._customWheelEvent(n)),this.dispatchEvent(em))}function gS(n){this.enabled!==!1&&this._handleKeyDown(n)}function yS(n){switch(this._trackPointer(n),this._pointers.length){case 1:switch(this.touches.ONE){case Fn.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(n),this.state=ct.TOUCH_ROTATE;break;case Fn.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(n),this.state=ct.TOUCH_PAN;break;default:this.state=ct.NONE}break;case 2:switch(this.touches.TWO){case Fn.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(n),this.state=ct.TOUCH_DOLLY_PAN;break;case Fn.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(n),this.state=ct.TOUCH_DOLLY_ROTATE;break;default:this.state=ct.NONE}break;default:this.state=ct.NONE}this.state!==ct.NONE&&this.dispatchEvent(Cu)}function vS(n){switch(this._trackPointer(n),this.state){case ct.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(n),this.update();break;case ct.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(n),this.update();break;case ct.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(n),this.update();break;case ct.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(n),this.update();break;default:this.state=ct.NONE}}function xS(n){this.enabled!==!1&&n.preventDefault()}function bS(n){n.key==="Control"&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function _S(n){n.key==="Control"&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function SS(n,e){let[t,i,r,s]=n,a=[(t[0]+r[0])/2,(t[1]+r[1])/2],o=[(i[0]-t[0])/2,(i[1]-t[1])/2],l=[(s[0]-t[0])/2,(s[1]-t[1])/2];for(let c of[0,1]){let h=2*(Math.abs(o[c])+Math.abs(l[c]));h>=e||(h>0?(o[c]*=e/h,l[c]*=e/h):(Math.hypot(...o)<Math.hypot(...l)?o:l)[c]=e/2)}return[[a[0]-o[0]-l[0],a[1]-o[1]-l[1]],[a[0]+o[0]-l[0],a[1]+o[1]-l[1]],[a[0]+o[0]+l[0],a[1]+o[1]+l[1]],[a[0]-o[0]+l[0],a[1]-o[1]+l[1]]]}function wS(n,e,t,i,r,s){let a=0,o=1,l=e[0]-n[0],c=e[1]-n[1];for(let[h,u]of[[-l,n[0]-t],[l,i-n[0]],[-c,n[1]-r],[c,s-n[1]]])if(h===0){if(u<0)return null}else{let f=u/h;h<0?a=Math.max(a,f):o=Math.min(o,f)}return a<=o?[a,o]:null}function MS(n,e,t,i){let r=n.length,s=[],a=0,o=[];for(let d=0;d<r;d++){let g=n[d],y=n[(d+1)%r],m=Math.hypot(y[0]-g[0],y[1]-g[1]);s.push(a);let p=wS(g,y,-16,e+16,-16,t+16);if(p!==null&&m>0){let b=o[o.length-1],_=a+p[0]*m;b!==void 0&&_-b[1]<1e-9*Math.max(1,_)?b[1]=a+p[1]*m:o.push([_,a+p[1]*m])}a+=m}let l=a;if(!(l>0)||!Number.isFinite(l))return{closed:!1,paths:[]};if(o.length===1&&o[0][0]===0&&o[0][1]>=l*(1-1e-12)&&i===void 0)return{closed:!0,paths:[n.map(d=>[d[0],d[1]])]};let h=d=>{let g=r-1;for(;g>0&&s[g]>d;)g--;let y=n[g],m=n[(g+1)%r],p=(g+1<r?s[g+1]:l)-s[g],b=p>0?(d-s[g])/p:0;return[y[0]+b*(m[0]-y[0]),y[1]+b*(m[1]-y[1])]},u=(d,g)=>{let y=[h(d)];for(let m=1;m<r;m++)s[m]>d&&s[m]<g&&y.push(n[m]);return y.push(h(g)),y},f=[];for(let[d,g]of o){if(i===void 0){f.push(u(d,g));continue}let y=i[0]+i[1];for(let m=Math.floor(d/y);m*y<g;m++){let p=Math.max(d,m*y),b=Math.min(g,m*y+i[0]);b>p&&f.push(u(p,b))}}return{closed:!1,paths:f}}function ES(n,e,t,i=[]){let r=n.filter((h,u)=>u===0||Math.hypot(h[0]-n[u-1][0],h[1]-n[u-1][1])>1e-9);e&&r.length>1&&Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1])<=1e-9&&r.pop();let s=r.length;if(s<2)return i;let a=t/2,o=(h,u)=>{let f=Math.hypot(u[0]-h[0],u[1]-h[1]);return[-(u[1]-h[1])/f,(u[0]-h[0])/f]},l=[];for(let h=0;h<s;h++){let u=e||h>0?o(r[(h-1+s)%s],r[h]):null,f=e||h<s-1?o(r[h],r[(h+1)%s]):null;if(u===null||f===null){let p=u??f;l.push([p[0]*a,p[1]*a]);continue}let d=[u[0]+f[0],u[1]+f[1]],g=Math.hypot(d[0],d[1]),y=g>1e-9?[d[0]/g,d[1]/g]:f,m=a/Math.max(1/4,y[0]*f[0]+y[1]*f[1]);l.push([y[0]*m,y[1]*m])}let c=e?s:s-1;for(let h=0;h<c;h++){let u=(h+1)%s,[f,d,g,y]=[r[h],r[u],l[h],l[u]],m=[f[0]+g[0],f[1]+g[1]],p=[f[0]-g[0],f[1]-g[1]],b=[d[0]+y[0],d[1]+y[1]],_=[d[0]-y[0],d[1]-y[1]];i.push(...m,...p,...b,...p,..._,...b)}return i}function tm(n,e,t,i){let{closed:r,paths:s}=MS(SS(n,i.minSize),e,t,i.dash),a=[];for(let o of s)ES(o,r,i.width,a);return a}function nm(n){let e=new Map;for(let t of n){let i=JSON.stringify([t.label,t.gradient,t.lo,t.hi]),r=e.get(i);r===void 0?e.set(i,t):e.set(i,{...r,marker:r.marker??t.marker,band:r.band??t.band})}return[...e.values()]}function gs(n,e,t){let i={panels:new Map,gutters:[]},r=(s,a,o)=>{if(s.kind==="panel"){i.panels.set(s.id,a);return}let l=s.dir==="row",c=Math.max(0,(l?a.w:a.h)-t),h=Math.round(c*s.ratio),u=c-h;l?(r(s.a,{x:a.x,y:a.y,w:h,h:a.h},`${o}a`),i.gutters.push({path:o,dir:s.dir,rect:{x:a.x+h,y:a.y,w:t,h:a.h},outer:a}),r(s.b,{x:a.x+h+t,y:a.y,w:u,h:a.h},`${o}b`)):(r(s.a,{x:a.x,y:a.y,w:a.w,h},`${o}a`),i.gutters.push({path:o,dir:s.dir,rect:{x:a.x,y:a.y+h,w:a.w,h:t},outer:a}),r(s.b,{x:a.x,y:a.y+h+t,w:a.w,h:u},`${o}b`))};return r(n,e,""),i}function lc(n,e,t){return n.kind==="panel"?n:e===""?{...n,ratio:t}:e[0]==="a"?{...n,a:lc(n.a,e.slice(1),t)}:{...n,b:lc(n.b,e.slice(1),t)}}function im(n,e,t,i){let r=n.outer,s=n.dir==="row"?e-r.x-i/2:t-r.y-i/2,a=Math.max(1,(n.dir==="row"?r.w:r.h)-i);return Math.min(.9,Math.max(.1,s/a))}var bs=6,rm=9,TS=10,AS=.8,CS=8,RS=8,PS=.25,IS=.35,fc="vec4(2.0, 2.0, 2.0, 1.0)",mm=`
attribute vec2 useg;
attribute float track;
uniform highp sampler2D uRanges;
uniform highp sampler2D uAlphas;
uniform int uRangesWidth;
uniform int uKernel;
uniform float uLap;
uniform float uSkip;
uniform float uOpacity;
uniform float uFraction;
uniform float uTaperOpacity;
ivec2 texelOf(float tr) {
  int t = int(tr + 0.5);
  return ivec2(t % uRangesWidth, t / uRangesWidth);
}
bool revealed(vec4 r) {
  bool lo = uLap > r.x || (uLap == r.x && r.y < useg.x);
  bool hi = uLap < r.z || (uLap == r.z && useg.y < r.w);
  return lo && hi && !(uSkip >= 0.0 && abs(track - uSkip) < 0.5);
}
float along(vec4 r, float u) {
  if (uFraction <= 0.0) return 1.0;
  return clamp(1.0 - (r.z + r.w - (uLap + u)) / uFraction, 0.0, 1.0);
}
float alphaOf(float tr) {
  return uKernel == 1 ? texelFetch(uAlphas, texelOf(tr), 0).x : uOpacity;
}
`,gm=`
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
    if (va.z >= 0.0 && vb.z >= 0.0) return ${fc};
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
`,LS=mm+`
#ifdef USE_TRACK_COLOR
attribute vec3 tcolor;
#endif
uniform vec3 uColor;
varying vec4 vColor;
void main() {
  vec4 r = texelFetch(uRanges, texelOf(track), 0);
  if (!revealed(r)) {
    vColor = vec4(0.0);
    gl_Position = ${fc};
    return;
  }
  float s = along(r, gl_VertexID % 2 == 1 ? useg.y : useg.x);
#ifdef USE_TRACK_COLOR
  vec3 rgb = tcolor;
#else
  vec3 rgb = uColor;
#endif
  vColor = vec4(rgb, alphaOf(track) * mix(uTaperOpacity, 1.0, s));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,DS=mm+gm+`
attribute vec3 instanceStart;
attribute vec3 instanceEnd;
#ifdef USE_TRACK_COLOR
attribute vec3 colorStart;
attribute vec3 colorEnd;
#endif
uniform vec3 uColor;
uniform float uWidth;
uniform float uTaperWidth;
varying vec4 vColor;
void main() {
  vec4 r = texelFetch(uRanges, texelOf(track), 0);
  if (!revealed(r)) {
    vColor = vec4(0.0);
    gl_Position = ${fc};
    return;
  }
  bool atEnd = position.y > 0.5;
  float s = along(r, atEnd ? useg.y : useg.x);
#ifdef USE_TRACK_COLOR
  vec3 rgb = atEnd ? colorEnd : colorStart;
#else
  vec3 rgb = uColor;
#endif
  vColor = vec4(rgb, alphaOf(track) * mix(uTaperOpacity, 1.0, s));
  gl_Position = corner(instanceStart, instanceEnd, uWidth * mix(uTaperWidth, 1.0, s));
}
`,kS=gm+`
attribute vec3 instanceStart;
attribute vec3 instanceEnd;
attribute vec4 colorStart;
attribute vec4 colorEnd;
attribute float widthStart;
attribute float widthEnd;
varying vec4 vColor;
void main() {
  bool atEnd = position.y > 0.5;
  vColor = atEnd ? colorEnd : colorStart;
  gl_Position = corner(instanceStart, instanceEnd, atEnd ? widthEnd : widthStart);
}
`,sm=`
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
    gl_Position = ${fc};
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
`,NS=`
uniform vec4 uColor;
varying vec4 vColor;
void main() {
  vColor = uColor;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,OS=`
varying vec4 vColor;
void main() {
  gl_FragColor = vColor;
}
`;function US(){let n=document.createElement("canvas");n.width=n.height=64;let e=n.getContext("2d");e.fillStyle="#fff",e.beginPath(),e.arc(32,32,28,0,Math.PI*2),e.fill();let t=new ca(n);return t.needsUpdate=!0,t}function cc(n,e=6){if(!(n>0)||!Number.isFinite(n))return 1;let t=n/e,i=Math.pow(10,Math.floor(Math.log10(t))),r=t/i;return(r<1.5?1:r<3.5?2:r<7.5?5:10)*i}function zi(n){let e=(o,l,c)=>new N(o,l,c);if(n.kind==="plane")return n.plane==="xz"?{right:e(1,0,0),up:e(0,0,1),normal:e(0,-1,0)}:n.plane==="yz"?{right:e(0,1,0),up:e(0,0,1),normal:e(1,0,0)}:{right:e(1,0,0),up:e(0,1,0),normal:e(0,0,1)};let[t,i,r]=n.up==="x"?[e(0,1,0),e(0,0,1),e(1,0,0)]:n.up==="y"?[e(0,0,1),e(1,0,0),e(0,1,0)]:[e(1,0,0),e(0,1,0),e(0,0,1)],s=t.clone().addScaledVector(i,-1.6).addScaledVector(r,.9).normalize();return{right:new N().crossVectors(r,s).normalize(),up:r,normal:s}}function wa(n){return n.kind==="orbit"&&n.stretch!==void 0?new N(...n.stretch):new N(1,1,1)}function FS(n){return n.plane==="xz"?[0,2]:n.plane==="yz"?[1,2]:[0,1]}function ku(){let n=new as;return n.setAttribute("position",new Xt([-1,0,0,1,0,0,-1,1,0,1,1,0],3)),n.setIndex([0,1,2,2,1,3]),n}var Ea=(n,e,t={})=>new an({vertexShader:n,fragmentShader:OS,uniforms:e,defines:t,transparent:!0,depthTest:!1,depthWrite:!1,side:An}),am=n=>Math.min(1,Math.max(0,n)),Ru=class{cache=new Map;get(e,t){let i=this.cache.get(e);return i===void 0&&(i=t(),this.cache.set(e,i)),i}};function BS(n,e){if(e===void 0||typeof e=="string"||typeof e.colormap=="string")return e;let t=e.colormap;it(n.scene,t.var)?.kind!=="choice"&&R("2.7",`the colormap is keyed on ${t.var}, which is not a choice`);let i=xi(n,t.var),r=typeof i=="string"&&Object.hasOwn(t.map,i)?t.map[i]:void 0;return r===void 0&&R("2.7",`the colormap keyed on ${t.var} does not name a colormap for ${JSON.stringify(i)}`),{...e,colormap:r}}function zS(n,e,t,i){let r=t.panels[i],s=n.views[r.view],a={scene:n,state:t,panel:r},o=qi(a,s),l=Ot(n.clock),c=rn(a,s.driver.sets),h=c===null?null:{set:e.sets.get(c),track:0};h&&(h.track=Cr(a,s.driver.member,h.set),l>1&&!h.set.periodic&&R("C6",`the driver's track set ${h.set.id} is not periodic, and the clock has ${l} laps`));let u=[];return s.layers.forEach((f,d)=>{if(Rr(a,f))if(f.kind==="track"){let g=rn(a,f.sets),y=g===null?null:e.sets.get(g),m=y===null?[]:Rs(a,f.members,y),p=Fd(f,n.clock)?t.clock.channel:null,b=f.context??"own";b!=="own"&&b!=="driver"&&R("L6",`a track layer's context is ${JSON.stringify(b)}, not own or driver`),y!==null&&p!==null&&l>1&&!y.periodic&&R("C6",`a reading is taken on track set ${y.id}, which is not periodic, and the clock has ${l} laps`);let _=f.highlight;if(_?.kernel!==void 0){let A=it(n,_.var);(A?.kind!=="selector"||(A.by??"nearest")!=="nearest"||A.parameter===void 0)&&R("2.7",`a highlight kernel needs a selector by nearest, and ${_.var} is not one`)}let v=y!==null&&_!==void 0?Ua(a,{var:_.var},y):null,E=v!==null&&m.includes(v)?v:null;u.push({kind:"track",index:d,layer:f,set:y,members:m,highlight:E,selected:v,channel:p,color:BS(a,f.color),context:b})}else if(f.kind==="arrow"){let g=rn(a,f.sets);u.push({kind:"arrow",index:d,layer:f,set:g===null?null:e.sets.get(g),channel:t.clock.channel})}else f.kind==="outline"?u.push({kind:"outline",index:d,layer:f}):f.kind==="body"?u.push({kind:"body",index:d,layer:f}):u.push({kind:f.kind,index:d,layer:f})}),{viewId:r.view,view:s,display:o,scope:a,driver:h,layers:u}}function VS(n){return[n.viewId,n.display,n.driver?.set.id??"",...n.layers.map(e=>e.kind==="track"?e.set?.id??"":"")].join("\0")}function Pu(n,e,t,i){let r=n.transform([0,0,0],e,t,i),s=new Float64Array(12);for(let a=0;a<3;a++){let o=n.transform([a===0?1:0,a===1?1:0,a===2?1:0],e,t,i);for(let l=0;l<3;l++)s[3*l+a]=o[l]-r[l]}return s.set(r,9),s}function HS(n,e,t,i=new bt,r){let{a:s,b:a,w:o}=za(t,Ps(n,t,r).at),l=Pu(n.frames,e,n.display,s),c=Pu(n.frames,e,n.display,a),h=l.map((u,f)=>(1-o)*u+o*c[f]);return i.set(h[0],h[1],h[2],h[9],h[3],h[4],h[5],h[10],h[6],h[7],h[8],h[11],0,0,0,1)}var GS=4e6;function WS(n,e,t,i,r){let s=i.frames,a=n.set.def.frame,o=i.geometry(n.set.id,a),l=e.set.periodic?Ot(i.scene.clock):1,c=s.requirements(a,t).channels.size>0,h=c?e.set.count(e.track):1,u=n.members.length===n.set.tracks?o.positions:Float64Array.from(n.members.flatMap(d=>[...o.track(d,0)]));if(u.length>24&&u.length/3*h*(c?l:1)>r){let[d,g,y,m,p,b]=o.bounds();u=Float64Array.from([d,g,y,m,g,y,d,p,y,m,p,y,d,g,b,m,g,b,d,p,b,m,p,b])}let f=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let d=0;d<(c?l:1);d++)for(let g=0;g<h;g++){let y=Pu(s,a,t,{set:e.set,track:e.track,sample:g,shifted:!1,lap:d});for(let m=0;m<u.length;m+=3){let p=u[m],b=u[m+1],_=u[m+2];for(let v=0;v<3;v++){let E=y[3*v]*p+y[3*v+1]*b+y[3*v+2]*_+y[9+v];E<f[v]&&(f[v]=E),E>f[v+3]&&(f[v+3]=E)}}}return f}function $S(n,e,t=GS){let i=null;for(let r of n.layers){if(r.kind!=="track"||r.set===null||r.members.length===0||r.layer.fit===!1||r.context==="driver"&&n.driver===null)continue;let s;if(r.context==="driver")s=[WS(r,n.driver,n.display,e,t)];else{let a=e.geometry(r.set.id,n.display);s=r.members.length===r.set.tracks?[a.bounds()]:r.members.map(o=>a.bounds(o))}for(let a of s)if(i===null)i=[...a];else for(let o=0;o<3;o++)i[o]=Math.min(i[o],a[o]),i[o+3]=Math.max(i[o+3],a[o+3])}return i}var hc=n=>n.kind==="plane"&&n.aspect==="free";function XS(n,e,t){let i=n.getCenter(new N),r=n.getSize(new N),s=Math.max(r.length()/2,1e-9),{right:a,up:o}=zi(e),l=y=>new N(Math.abs(y.x),Math.abs(y.y),Math.abs(y.z)),c=e.kind==="plane"?r.dot(l(a))/2:s,h=e.kind==="plane"?r.dot(l(o))/2:s,u=Math.max(h,c/t)*1.1,f=u>1e-12?u:Math.max(s,1);if(!hc(e))return{center:i,halfWidth:f*t,halfHeight:f};let d=y=>Math.max(Math.abs(n.min.dot(y)),Math.abs(n.max.dot(y))),g=(y,m)=>y>0&&y>1e-9*m;return{center:i,halfWidth:g(c,d(a))?c*1.1:f*t,halfHeight:g(h,d(o))?h*1.1:f}}function qS(n,e,t,i){let r=t>0?i/(e.width*t):0;return Math.max(n,e.opacity*Math.exp(-r*r))}function YS(n,e,t,i){let{right:r,up:s}=zi(e),a=n.position.dot(r),o=n.position.dot(s),l=(n.right-n.left)/(2*n.zoom),c=(n.top-n.bottom)/(2*n.zoom);return{x0:a-l,x1:a+l,y0:o-c,y1:o+c,w:t,h:i,stepX:cc(2*l,Math.max(3,t/110)),stepY:cc(2*c,Math.max(3,i/70))}}function uc(n,e,t){let i=[],r=Math.floor(e/t);for(let s=Math.ceil(n/t);s<=r&&i.length<1e3;s++)i.push(s*t);return i}function om(n,e){let t=Math.max(0,-Math.floor(Math.log10(e)));return(Math.abs(n)<e*1e-9?0:n).toFixed(t).replace("-","\u2212")}var ym=n=>7*n.length-3.5*(n.split(".").length-1);function lm(n){let e=n.kind==="title"?13:12,t=ym(n.text)*e/12,i=n.align==="center"?-t/2:n.align==="end"?-t:0;return n.rotate?[n.x-e/2,n.y-i-t,n.x+e/2,n.y-i]:[n.x+i,n.y-e/2,n.x+i+t,n.y+e/2]}function jS(n,e){let[t,i,r,s]=lm(n),[a,o,l,c]=lm(e);return t<l&&a<r&&i<c&&o<s}var cm=160;function JS(n,e,t){let i=[],r=a=>(a-n.x0)/(n.x1-n.x0)*n.w,s=a=>n.h-(a-n.y0)/(n.y1-n.y0)*n.h;if(e){let a=[];for(let l of uc(n.y0,n.y1,n.stepY)){let c=s(l);c>22&&c<n.h-44&&a.push({text:om(l,n.stepY),x:0,y:c,align:"end",kind:"tick"})}let o=Math.max(44,22+Math.max(0,...a.map(l=>ym(l.text))));for(let l of uc(n.x0,n.x1,n.stepX)){let c=r(l);c>o+12&&c<n.w-16&&i.push({text:om(l,n.stepX),x:c,y:n.h-28,align:"center",kind:"tick"})}for(let l of a)i.push({...l,x:o})}return t!==null&&(t[0]!==""&&n.h>=cm&&i.push({text:t[0],x:n.w/2,y:n.h-10,align:"center",kind:"title"}),t[1]!==""&&n.w>=cm&&i.push({text:t[1],x:10,y:n.h/2,align:"center",rotate:!0,kind:"title"})),i}var Iu=class{holder=new Ht;mat;spec;src;wide;obj=null;sharedNames=[];shown="";constructor(e,t,i){this.src=e,this.spec=t,this.wide=t.width>1;let r={...i,uLap:{value:t.lap},uSkip:{value:-1},uOpacity:{value:t.opacity},uWidth:{value:t.width},uKernel:{value:e.kernel&&!t.highlight?1:0}},s=e.coloring.kind==="sample"?{USE_TRACK_COLOR:""}:void 0;this.mat=Ea(this.wide?DS:LS,r,s)}show(e){let t=e===null?"":String(e);if(t===this.shown||(this.clear(),this.shown=t,e===null))return;let i=this.wide?this.quads(e):this.lines(e);this.obj=this.wide?new It(i,this.mat):new rs(i,this.mat),this.obj.frustumCulled=!1,this.obj.renderOrder=this.holder.parent?.renderOrder??0,this.holder.add(this.obj)}arrays(e){let{ctx:t,set:i,geo:r,display:s,readings:a,coloring:o,colorKey:l}=this.src,c=this.spec.lap;if(e==="set")return{pos:t.shared.get(`pos\0${i.id}\0${s}\0${r.lapKey(c)}`,()=>$d(r,c)),u:t.shared.get(`u\0${i.id}\0${a.channel}`,()=>Yd(i,a.u)),tr:t.shared.get(`t\0${i.id}`,()=>Jd(i)),col:o.kind==="sample"?t.shared.get(`c\0${i.id}\0${l}`,()=>Hd(i,o.rgb,3)):null};let h=i.start(e),u=i.count(e);return{pos:Xd(r,e,c),u:jd(a.u,h,u),tr:new Float32Array(2*(u-1)).fill(e),col:o.kind==="sample"?Gd(o.rgb,3,h,u):null}}lines(e){let t=this.arrays(e),i=(s,a,o)=>e==="set"?this.src.ctx.shared.get(`gl\0${s}\0${this.src.set.id}\0${um(a)}`,()=>new St(a,o)):new St(a,o),r=new wt;return r.setAttribute("position",i("position",t.pos,3)),r.setAttribute("useg",i("useg",t.u,2)),r.setAttribute("track",i("track",t.tr,1)),t.col&&r.setAttribute("tcolor",i("tcolor",t.col,3)),this.sharedNames=e==="set"?Object.keys(r.attributes):[],r}quads(e){let t=this.arrays(e),i=(a,o,l)=>e==="set"?this.src.ctx.shared.get(`gpu\0${a}\0${this.src.set.id}\0${um(o)}`,()=>new Oi(o,l)):new Oi(o,l),r=ku(),s=i("pos",t.pos,6);if(r.setAttribute("instanceStart",new Gt(s,3,0)),r.setAttribute("instanceEnd",new Gt(s,3,3)),r.setAttribute("useg",new Gt(i("u",t.u,4),2,0)),r.setAttribute("track",new Gt(i("t",t.tr,2),1,0)),t.col){let a=i("c",t.col,6);r.setAttribute("colorStart",new Gt(a,3,0)),r.setAttribute("colorEnd",new Gt(a,3,3))}return r.instanceCount=t.pos.length/6,this.sharedNames=e==="set"?Object.keys(r.attributes).filter(a=>a!=="position"):[],r}clear(){if(this.obj!==null){this.holder.remove(this.obj);for(let e of this.sharedNames)this.obj.geometry.deleteAttribute(e);this.obj.geometry.dispose(),this.obj=null,this.sharedNames=[]}}dispose(){this.clear(),this.mat.dispose()}},hm=new WeakMap,ZS=0;function um(n){let e=hm.get(n);return e===void 0&&(e=ZS++,hm.set(n,e)),e}var Lu=class{mesh;buffer;mat;n=0;constructor(e,t){this.mat=Ea(kS,{uResolution:t}),this.buffer=this.allocate(e),this.mesh=new It(this.geometry(),this.mat),this.mesh.frustumCulled=!1}allocate(e){let t=new Oi(new Float32Array(16*Math.max(1,e)),16);return t.setUsage(mi),t}geometry(){let e=ku(),t=this.buffer;return e.setAttribute("instanceStart",new Gt(t,3,0)),e.setAttribute("instanceEnd",new Gt(t,3,3)),e.setAttribute("colorStart",new Gt(t,4,6)),e.setAttribute("colorEnd",new Gt(t,4,10)),e.setAttribute("widthStart",new Gt(t,1,14)),e.setAttribute("widthEnd",new Gt(t,1,15)),e.instanceCount=0,e}begin(e){return 16*e>this.buffer.array.length&&(this.mesh.geometry.dispose(),this.buffer=this.allocate(2*e),this.mesh.geometry=this.geometry()),this.n=0,this.buffer.array}end(){this.mesh.geometry.instanceCount=this.n,this.mesh.visible=this.n>0,this.buffer.clearUpdateRanges(),this.buffer.addUpdateRange(0,16*this.n),this.buffer.needsUpdate=!0}dispose(){this.mesh.geometry.dispose(),this.mat.dispose()}};function KS(n,e,t){let i=e.highlight?.kernel;if(i===void 0)return null;let r=it(n.scene,e.highlight.var);if(r?.kind!=="selector"||r.parameter===void 0)return null;let s=t.parameter(r.parameter,"2.7"),a=1/0,o=-1/0;for(let l=0;l<s.length;l++)a=Math.min(a,s[l]),o=Math.max(o,s[l]);return{parameter:r.parameter,width:i.width,opacity:i.opacity,values:s,extent:o>=a?o-a:0}}function dm(n){let e=Math.min(Math.max(n,1),2048),t=Math.ceil(Math.max(n,1)/e),i=new Float32Array(4*e*t),r=new oa(i,e,t,on,Cn);return r.minFilter=r.magFilter=Vt,r.generateMipmaps=!1,r.needsUpdate=!0,{data:i,texture:r,width:e}}var ys=class{key;group=new gn;src;layer;set;geo;clocks;spec;color;width;hiWidth;opacity;hiOpacity;fraction;taperWidth;taperOpacity;kernel;ranges;alphas;resolution={value:new Le(1,1)};uniforms;baseHolder=new Ht;hiHolder=new Ht;passes=new Map;pieces;heads=null;headSize;headColor;members=[];highlight=null;selected=null;baseWhat=null;skip=-1;filled=!1;driverContext;geometry;constructor(e,t,i,r){this.key=r,this.geometry=e.geometry;let s=t.set,a=t.layer;this.set=s,this.layer=a,this.driverContext=t.context==="driver",this.driverContext&&(this.group.matrixAutoUpdate=!1),this.geo=e.geometry.geometry(s.id,this.driverContext?s.def.frame:i),this.clocks=t.channel===null?null:e.geometry.readings(s.id,t.channel);let o=this.clocks??e.geometry.readings(s.id,lt);this.spec=Bd(a,s.periodic,Ot(e.scene.clock)),this.color=t.color;let l=yd(t.color,s,Et(e.theme.foreground));this.kernel=KS(e,a,s),this.src={ctx:e,set:s,geo:this.geo,display:this.geo.frame,readings:o,colorKey:JSON.stringify(t.color??null),coloring:l,kernel:this.kernel!==null},this.width=a.width??1,this.hiWidth=a.highlight?.width??this.width,this.opacity=a.opacity??1,this.hiOpacity=a.highlight?.opacity??1,this.fraction=this.spec.reveal==="trail"?this.spec.laps*this.spec.fraction:0,this.taperWidth=a.trail?.taper?.width??PS,this.taperOpacity=a.trail?.taper?.opacity??IS,this.ranges=dm(s.tracks);for(let h=0;h<s.tracks;h++)this.ranges.data.set(Vs,4*h);this.alphas=this.kernel===null?null:dm(s.tracks),this.uniforms={uRanges:{value:this.ranges.texture},uAlphas:{value:(this.alphas??this.ranges).texture},uRangesWidth:{value:this.ranges.width},uColor:{value:new N(...l.kind==="constant"?l.rgb:[1,1,1])},uResolution:this.resolution,uFraction:{value:this.fraction},uTaperWidth:{value:this.taperWidth},uTaperOpacity:{value:this.fraction>0?this.taperOpacity:1}},this.group.add(this.baseHolder,this.hiHolder),this.pieces=new Lu(2*Math.min(s.tracks,64),this.resolution),this.group.add(this.pieces.mesh);let c=a.head;if(this.headSize=typeof c=="object"&&c!==null?c.size??rm:rm,this.headColor=typeof c=="object"&&c!==null&&c.color!==void 0?Et(c.color):null,bi(a)){let h=new dr({size:this.headSize,sizeAttenuation:!1,map:e.disc,alphaTest:.5,vertexColors:!0,transparent:!0,depthTest:!1,depthWrite:!1});this.heads=new ss(new wt,h),this.heads.frustumCulled=!1,this.growHeads(1),this.group.add(this.heads)}}growHeads(e){let t=this.heads;if(t===null)return;let i=t.geometry.getAttribute("position");if(i!==void 0&&i.count>=e)return;t.geometry.dispose();let r=new wt;r.setAttribute("position",new St(new Float32Array(3*e),3).setUsage(mi)),r.setAttribute("color",new St(new Float32Array(3*e),3).setUsage(mi)),t.geometry=r}resize(e,t){this.resolution.value.set(Math.max(1,e),Math.max(1,t))}colorAt(e,t,i,r){let s=this.src.coloring;if(s.kind==="constant"){i.set(s.rgb,r);return}let a=this.set.start(e);if("sample"in t){for(let o=0;o<3;o++)i[r+o]=s.rgb[3*(a+t.sample)+o];return}for(let o=0;o<3;o++)i[r+o]=(1-t.w)*s.rgb[3*(a+t.k)+o]+t.w*s.rgb[3*(a+t.k+1)+o]}fillKernel(){let e=this.kernel;if(e===null||this.alphas===null)return;let t=this.selected===null?null:e.values[this.selected];for(let i=0;i<this.set.tracks;i++)this.alphas.data[4*i]=t===null?this.opacity:qS(this.opacity,e,e.extent,Math.abs(e.values[i]-t));this.alphas.texture.needsUpdate=!0}showPass(e){e.show(e.spec.highlight?this.highlight:this.baseWhat),e.mat.uniforms.uSkip.value=e.spec.highlight?-1:this.skip}pass(e,t){let i=`${t?"h":"b"}${e}`,r=this.passes.get(i);return r===void 0&&(r=new Iu(this.src,{lap:e,highlight:t,width:t?this.hiWidth:this.width,opacity:t?this.hiOpacity:this.opacity},this.uniforms),(t?this.hiHolder:this.baseHolder).add(r.holder),this.passes.set(i,r),this.showPass(r)),r}syncPasses(e,t){for(let i of this.passes.values())i.holder.visible=!1;if(this.baseWhat!==null)for(let i=e[0];i<=e[1];i++)this.pass(i,!1).holder.visible=!0;if(this.highlight!==null)for(let i=t[0];i<=t[1];i++)this.pass(i,!0).holder.visible=!0}get isStatic(){return this.clocks===null&&!this.driverContext}place(e,t){this.group.visible=t!==null,t!==null&&(HS(e,this.set.def.frame,t,this.group.matrix,this.geometry.readings(t.set.id,e.channel).clocks[t.track]),this.group.matrixWorldNeedsUpdate=!0)}update(e,t,i){let r=e.highlight;if(e.members.length!==this.members.length||e.members.some((f,d)=>f!==this.members[d])||r!==this.highlight||e.selected!==this.selected){let f=e.layer.members!=="all"&&e.members.length===1?e.members[0]:-1;this.members=e.members,this.highlight=r,this.selected=e.selected,this.baseWhat=f>=0?f===r?null:f:e.members.length>0?"set":null,this.skip=f<0&&r!==null?r:-1;for(let d of this.passes.values())this.showPass(d);for(let d=0;d<this.set.tracks;d++)this.ranges.data.set(Vs,4*d);this.fillKernel(),this.growHeads(e.members.length),this.filled=!1}if(this.clocks===null&&this.filled)return!1;let a=this.pieces.begin(2*e.members.length),o=this.heads?.geometry.getAttribute("position"),l=this.heads?.geometry.getAttribute("color"),c=0,h=[1/0,-1/0],u=[1/0,-1/0];for(let f of e.members){let d=this.clocks?.clocks[f]??null,g=zd(d,t.clock,i,this.spec,Math.fround);this.ranges.data.set(g.range,4*f);let y=f===r;if(g.laps!==null){let _=y?u:h;_[0]=Math.min(_[0],g.laps[0]),_[1]=Math.max(_[1],g.laps[1])}let m=y?this.hiWidth:this.width,p=y?this.hiOpacity:this.alphas!==null?this.alphas.data[4*f]:this.opacity,b=this.fraction>0&&g.loop!==null;for(let _ of g.pieces){let v=16*this.pieces.n++;_.forEach((E,A)=>{this.geo.vertex(f,E,a,v+3*A),this.colorAt(f,E,a,v+6+4*A);let P=b?am(1-(g.loop-qd(d,E))/this.fraction):1;a[v+9+4*A]=p*(b?this.taperOpacity+(1-this.taperOpacity)*P:1),a[v+14+A]=m>1&&b?m*(this.taperWidth+(1-this.taperWidth)*P):m})}o!==void 0&&l!==void 0&&g.head!==null&&c<o.count&&(this.geo.vertex(f,g.head,o.array,3*c),this.headColor!==null?l.array.set(this.headColor,3*c):this.colorAt(f,g.head,l.array,3*c),c++)}return this.pieces.end(),this.heads!==null&&(o.needsUpdate=l.needsUpdate=!0,this.heads.geometry.setDrawRange(0,c)),this.syncPasses(h,u),this.ranges.texture.needsUpdate=!0,this.filled=!0,!0}extend(){}colorbar(){let e=this.color;if(e===void 0||typeof e=="string")return null;let t=Fc(e,this.set),i=this.set.def.parameters??{},r=t.perTrack&&Object.hasOwn(i,t.name)?i[t.name]:void 0,s=r?.label??t.name,[a,o]=t.range,l=d=>o===a?.5:am((d-a)/(o-a)),c=this.highlight??(this.layer.members!=="all"&&this.members.length===1?this.members[0]:null),h=t.perTrack&&c!==null?l(t.values[c]):null,u=this.kernel,f=null;if(u!==null&&t.perTrack&&t.name===u.parameter&&this.selected!==null){let d=t.values[this.selected],g=1.5*u.width*u.extent;f=[l(d-g),l(d+g)]}return{label:r?.unit?`${s}, ${r.unit}`:s,gradient:vd(t),stops:Bc(t),lo:a,hi:o,marker:h,band:f}}dispose(){for(let e of this.passes.values())e.dispose();this.ranges.texture.dispose(),this.alphas?.texture.dispose(),this.pieces.dispose(),this.heads&&(this.heads.geometry.dispose(),this.heads.material.dispose())}},vs=class{key;group=new gn;label;size;at=null;point;trail;geometry;scratch=new Float64Array(3);capacity=0;constructor(e,t,i){this.key=i,this.geometry=e.geometry;let r=e.scene.bodies??{},s=Object.hasOwn(r,t.body)?r[t.body]:void 0;this.label=s?.label??null,this.size=t.size??CS;let a=new Je(...Et(s?.color??e.theme.foreground)),o=new wt;o.setAttribute("position",new St(new Float32Array(3),3).setUsage(mi)),this.point=new ss(o,new dr({color:a,size:this.size,sizeAttenuation:!1,map:e.disc,alphaTest:.5,transparent:!0,depthTest:!1,depthWrite:!1})),this.point.frustumCulled=!1,this.trail=new is(new wt,new ur({color:a,transparent:!0,opacity:.6,depthTest:!1,depthWrite:!1})),this.trail.frustumCulled=!1,this.group.add(this.trail,this.point)}update(e,t,i){if(i===null){this.point.visible=!1,this.trail.visible=!1,this.at=null;return}let{set:r,track:s}=i,a=Ot(e.clock),o=this.geometry.readings(r.id,e.channel).clocks[s],l=this.geometry.bodyTrail(t.body,e.display,r.id,s),c=a*ei(o.reading(e.clock,e.q)),h=Zt(c,a),u=this.scratch;l.vertex(Rt(o,h.u,!1,h.lap),u),this.point.visible=!0,this.at=new N(u[0],u[1],u[2]);let f=this.point.geometry.getAttribute("position");if(f.setXYZ(0,u[0],u[1],u[2]),f.needsUpdate=!0,t.trail===void 0){this.trail.visible=!1;return}let d=t.trail.fraction,g=c-a*d;g<0&&!r.periodic&&(g=0);let y=Zd(l.m,a,d);if(y>this.capacity){this.capacity=y,this.trail.geometry.dispose();let b=new wt;b.setAttribute("position",new St(new Float32Array(3*this.capacity),3).setUsage(mi)),this.trail.geometry=b}let m=this.trail.geometry.getAttribute("position"),p=l.polyline(o,g,c,a,m.array);m.clearUpdateRanges(),m.addUpdateRange(0,3*p),m.needsUpdate=!0,this.trail.geometry.setDrawRange(0,p),this.trail.visible=p>1}extend(e){this.at!==null&&e.expandByPoint(this.at)}dispose(){for(let e of[this.point,this.trail])e.geometry.dispose(),e.material.dispose()}},dc=class{key;group=new gn;geometry;resolution={value:new Le(1,1)};shaft;head;buffer;constructor(e,t,i){this.key=i,this.geometry=e.geometry;let{layer:r}=t,s={uResolution:this.resolution,uColor:{value:new ut(...Et(r.color??e.theme.foreground),r.opacity??1)},uWidth:{value:r.width??1},uHead:{value:r.head?.size??TS},uHeadWidth:{value:AS}};this.buffer=this.allocate(t.set.tracks);let a=new as;a.setAttribute("position",new Xt([-1,0,0,1,0,0,0,1,0],3)),this.shaft=new It(this.attach(ku()),Ea(sm,s)),this.head=new It(this.attach(a),Ea(sm,s,{HEAD:""}));for(let o of[this.shaft,this.head])o.frustumCulled=!1;this.group.add(this.shaft,this.head)}allocate(e){return new Oi(new Float32Array(6*Math.max(1,e)),6).setUsage(mi)}attach(e){return e.setAttribute("instanceBase",new Gt(this.buffer,3,0)),e.setAttribute("instanceTip",new Gt(this.buffer,3,3)),e.instanceCount=0,e}update(e,t){let i=this.geometry.readings(t.set.id,t.channel).clocks,s=Va(e,t.layer,t.set,o=>i[o]).members.filter(o=>o.base!==null&&o.tip!==null);if(6*s.length>this.buffer.array.length){this.buffer=this.allocate(2*s.length);for(let o of[this.shaft,this.head])o.geometry.deleteAttribute("instanceBase"),o.geometry.deleteAttribute("instanceTip"),this.attach(o.geometry)}let a=this.buffer.array;s.forEach((o,l)=>{a.set(o.base,6*l),a.set(o.tip,6*l+3)}),this.buffer.clearUpdateRanges(),this.buffer.addUpdateRange(0,6*s.length),this.buffer.needsUpdate=!0;for(let o of[this.shaft,this.head])o.geometry.instanceCount=s.length,o.visible=s.length>0}resize(e,t){this.resolution.value.set(Math.max(1,e),Math.max(1,t))}extend(){}dispose(){for(let e of[this.shaft,this.head])e.geometry.dispose(),e.material.dispose()}};function QS(n,e,t,i,r,s,a){let{right:o,up:l}=zi(t),c=wa(r);i.updateMatrixWorld();let[h,u,f]=n.axes.map(g=>new N(...g)),d=[];for(let[g,y]of[[e.x0,e.y0],[e.x1,e.y0],[e.x1,e.y1],[e.x0,e.y1]]){let m=o.clone().multiplyScalar(g).addScaledVector(l,y),p=new N(...n.origin).addScaledVector(h,m.x).addScaledVector(u,m.y).addScaledVector(f,m.z);if(p.multiply(c).applyMatrix4(i.matrixWorldInverse),i instanceof $t&&p.z>=-i.near)return null;p.applyMatrix4(i.projectionMatrix),d.push([(p.x+1)/2*s,(1-p.y)/2*a])}return d}var Ma=class{key;group=new gn;layer;mesh;positions=new Float32Array(0);map=null;constructor(e,t,i){this.key=i,this.layer=t;let r=new ut(...Et(t.color??e.theme.foreground),t.opacity??1);this.mesh=new It(new wt,Ea(NS,{uColor:{value:r}})),this.mesh.frustumCulled=!1,this.mesh.visible=!1,this.group.add(this.mesh)}update(e,t){this.map=Ha(e,this.layer,t)}get target(){return this.map?.origin==null?null:this.map.panel}place(e,t){let i=this.map,r=[],{w:s,h:a}=e.rect;if(i?.origin!=null&&i.axes!==null&&t?.view!=null&&t.error===null&&t.cameraSpec.kind==="plane"){let l=QS({...i,origin:i.origin,axes:i.axes},t.view,t.cameraSpec,e.camera,e.cameraSpec,s,a),c={width:this.layer.width??1,minSize:this.layer.min_size??RS,dash:this.layer.dash};l!==null&&(r=tm(l,s,a,c))}let o=r.length/2;3*o>this.positions.length&&(this.positions=new Float32Array(3*Math.max(2*o,96)),this.mesh.geometry.dispose(),this.mesh.geometry=new wt,this.mesh.geometry.setAttribute("position",new St(this.positions,3).setUsage(mi)));for(let l=0;l<o;l++)this.positions[3*l]=2*r[2*l]/s-1,this.positions[3*l+1]=1-2*r[2*l+1]/a;if(o>0){let l=this.mesh.geometry.getAttribute("position");l.clearUpdateRanges(),l.addUpdateRange(0,3*o),l.needsUpdate=!0}this.mesh.geometry.setDrawRange(0,o),this.mesh.visible=o>0}extend(){}dispose(){this.mesh.geometry.dispose(),this.mesh.material.dispose()}},Bi=class{key;group=new gn;kind;follows;full;ticks;theme;lines;shown="";tips=[];constructor(e,t,i,r){this.key=r,this.kind=t.kind,this.theme=e.theme;let s=i.kind==="plane";t.kind==="axes"?(this.full=(t.span??(s?"full":"positive"))==="full",this.ticks=s&&this.full):(this.full=!1,this.ticks=s&&(t.labels??s)),this.follows=this.ticks||t.kind==="grid"&&hc(i);let a=new ur({vertexColors:!0,transparent:!0,depthTest:!1,depthWrite:!1});this.lines=new rs(new wt,a),this.lines.frustumCulled=!1,this.group.add(this.lines)}set(e,t){this.lines.geometry.dispose();let i=new wt;i.setAttribute("position",new Xt(e,3)),i.setAttribute("color",new Xt(t,4)),this.lines.geometry=i}layout(e,t,i=new N(1,1,1)){if(this.follows)return;let r=e.getCenter(new N),s=e.getSize(new N),a=Math.max(s.x,s.y,s.z,1e-9),o=[],l=[],c=(h,u,f,d)=>{o.push(h.x,h.y,h.z,u.x,u.y,u.z),l.push(...f,d,...f,d)};if(this.kind==="axes"){let h=s.clone().multiply(i),u=Math.max(h.x,h.y,h.z,1e-9),f=g=>cc(hc(t)&&g>1e-9*u?g:u,2),d=Et(this.theme.foreground);this.tips=[new N(f(h.x)/i.x,0,0),new N(0,f(h.y)/i.y,0),new N(0,0,f(h.z)/i.z)];for(let g of this.tips)c(this.full?g.clone().negate():new N,g,d,.8)}else{let{right:h,up:u,normal:f}=zi(t.kind==="plane"?t:{kind:"plane",plane:t.up==="x"?"yz":t.up==="y"?"xz":"xy"}),d=cc(a,8),g=Et(this.theme.grid),y=Et(Ut(this.theme.grid,this.theme.foreground,.3)),m=r.dot(h),p=r.dot(u),b=Math.abs(f.x)>.5?"x":Math.abs(f.y)>.5?"y":"z",_=new N;_[b]=1;let v=e.min[b]<=0&&e.max[b]>=0?0:r[b],E=2.5*a,A=Math.floor((m-E)/d),P=Math.ceil((m+E)/d),k=Math.floor((p-E)/d),w=Math.ceil((p+E)/d),M=(L,V)=>h.clone().multiplyScalar(L).addScaledVector(u,V).addScaledVector(_,v);for(let L=A;L<=P;L++)c(M(L*d,k*d),M(L*d,w*d),L===0?y:g,1);for(let L=k;L<=w;L++)c(M(A*d,L*d),M(P*d,L*d),L===0?y:g,1)}this.set(o,l)}follow(e,t){if(!this.follows)return;let i=[e.x0,e.x1,e.y0,e.y1,e.stepX,e.stepY].join(",");if(i===this.shown)return;this.shown=i;let{right:r,up:s}=zi(t),a=[],o=[],l=(c,h,u,f,d,g)=>{let y=r.clone().multiplyScalar(c).addScaledVector(s,h),m=r.clone().multiplyScalar(u).addScaledVector(s,f);a.push(y.x,y.y,y.z,m.x,m.y,m.z),o.push(...d,g,...d,g)};if(this.kind==="axes"){let c=Et(this.theme.foreground);e.y0<=0&&e.y1>=0&&l(e.x0,0,e.x1,0,c,.5),e.x0<=0&&e.x1>=0&&l(0,e.y0,0,e.y1,c,.5)}else{let c=Et(this.theme.grid),h=Et(Ut(this.theme.grid,this.theme.foreground,.3));for(let u of uc(e.x0,e.x1,e.stepX))l(u,e.y0,u,e.y1,u===0?h:c,1);for(let u of uc(e.y0,e.y1,e.stepY))l(e.x0,u,e.x1,u,u===0?h:c,1)}this.set(a,o)}extend(){}dispose(){this.lines.geometry.dispose(),this.lines.material.dispose()}},ew=100,tw=150;function fm(n,e,t){return new En(n,e,{samples:t,depthBuffer:!1,minFilter:Vt,magFilter:Vt,generateMipmaps:!1})}function nw(){let n=new an({glslVersion:_a,uniforms:{uUnderlay:{value:null}},vertexShader:"void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",fragmentShader:"uniform sampler2D uUnderlay; out vec4 color; void main() { color = texelFetch(uUnderlay, ivec2(gl_FragCoord.xy), 0); }",depthTest:!1,depthWrite:!1,blending:Bn}),e=new It(new fr(2,2),n);e.frustumCulled=!1;let t=new hr;return t.add(e),{scene:t,camera:new Un,material:n}}function iw(n,e){n.updateMatrixWorld();let t=n.matrixWorld.elements,i=n.projectionMatrix.elements,r=!1;for(let s=0;s<16;s++)e[s]!==t[s]&&(r=!0,e[s]=t[s]),e[16+s]!==i[s]&&(r=!0,e[16+s]=i[s]);return r}var Du=class{id;scene=new hr;staticScene=new hr;underlay=new ut(-1,-1,-1,-1);underlayDirty=!0;staticKey="";rebuiltAt=-1/0;coarse=!1;cameraSeen=new Float64Array(32);camera=new Un;cameraSpec={kind:"plane",plane:"xy"};controls=null;element=null;labels=null;plan=null;error=null;draws=new Map;rect={x:0,y:0,w:1,h:1};content="";needsFit=!0;userMoved=!1;fitting=!1;halfWidth=1;halfHeight=1;box=null;target=new N;turned=0;view=null;constructor(e){this.id=e}},pm=n=>JSON.stringify(n),rw=n=>n.kind==="orbit"&&(n.turn??0)!==0,xs=class{canvas;onChange=()=>{};gl;ctx;panels=new Map;lastState=null;size={w:0,h:0,ratio:0};background;cacheStatic;coarseDrags;refineTimer=null;blit;underlay=null;scratch=null;viewport=new ut;buffer=new Le;region=new fa;corner=new Le;constructor(e,t,i,r={}){this.canvas=e,Ke.enabled=!1,this.gl=new rc({canvas:e,antialias:!0,preserveDrawingBuffer:r.preserveDrawingBuffer??!1}),this.cacheStatic=r.cacheStatic??!0,this.coarseDrags=r.coarseDrags??!0,this.blit=nw(),e.addEventListener("webglcontextrestored",()=>{for(let a of this.panels.values())a.underlayDirty=!0}),this.gl.outputColorSpace=ui,this.gl.autoClear=!1;let s=r.theme??Ir(t);this.background=new Je(...Et(s.background)),this.ctx={scene:t,geometry:i,shared:new Ru,theme:s,disc:US()}}setTheme(e){this.ctx.theme=e,this.background.setRGB(...Et(e.background)),this.lastState=null;for(let t of this.panels.values())t.underlayDirty=!0}panel(e){let t=this.panels.get(e);return t||(t=new Du(e),this.panels.set(e,t)),t}bind(e,t){let i=this.panel(e);i.element!==t&&(i.controls?.dispose(),i.controls=null,i.labels?.remove(),i.labels=null,i.element=t,t!==null&&(i.labels=document.createElement("div"),i.labels.className="labels",t.append(i.labels),this.makeControls(i)))}refit(e){let t=this.panels.get(e);t&&(t.needsFit=!0,t.userMoved=!1)}refitAll(){for(let e of this.panels.keys())this.refit(e)}makeControls(e){if(e.controls?.dispose(),e.controls=null,e.element===null)return;let t=new oc(e.camera,e.element);t.enableDamping=!1,t.screenSpacePanning=!0,e.cameraSpec.kind==="plane"&&(t.enableRotate=!1,t.zoomToCursor=!0,t.mouseButtons={LEFT:Tn.PAN,MIDDLE:Tn.DOLLY,RIGHT:Tn.PAN},t.touches={ONE:Fn.PAN,TWO:Fn.DOLLY_PAN}),t.addEventListener("change",()=>{e.fitting||(e.userMoved=!0,this.onChange())}),e.controls=t}setCamera(e,t){e.cameraSpec=t;let i=t.kind==="plane"||t.projection==="orthographic";e.camera=i?new Un(-1,1,1,-1,-1,1):new $t(35,1,.01,100);let r=wa(t);e.scene.scale.copy(r),e.staticScene.scale.copy(r),e.underlayDirty=!0,e.needsFit=!0,e.userMoved=!1,this.makeControls(e)}drawStatic(e){if(e.staticScene.children.length===0)return;if(!this.cacheStatic||rw(e.cameraSpec)){this.gl.render(e.staticScene,e.camera);return}let t=this.gl.getDrawingBufferSize(this.buffer);if(this.underlay===null||this.underlay.width!==t.x||this.underlay.height!==t.y){this.underlay?.dispose(),this.underlay=fm(t.x,t.y,0),this.gl.initRenderTarget(this.underlay);for(let r of this.panels.values())r.underlayDirty=!0}let i=this.gl.getCurrentViewport(this.viewport);if(i.equals(e.underlay)||(e.underlay.copy(i),e.underlayDirty=!0),iw(e.camera,e.cameraSeen)&&(e.underlayDirty=!0),e.underlayDirty){e.underlayDirty=!1;let r=performance.now();e.coarse=this.coarseDrags&&r-e.rebuiltAt<ew,e.rebuiltAt=r,e.coarse?(this.drawCoarse(e,this.underlay,i),this.scheduleRefine()):this.drawFine(e,this.underlay,i)}this.blit.material.uniforms.uUnderlay.value=this.underlay.texture,this.gl.render(this.blit.scene,this.blit.camera)}drawCoarse(e,t,i){t.viewport.copy(i),t.scissor.copy(i),t.scissorTest=!0,this.gl.setRenderTarget(t),this.gl.clear(!0,!1,!1),this.gl.render(e.staticScene,e.camera),this.gl.setRenderTarget(null)}scheduleRefine(){this.refineTimer!==null&&clearTimeout(this.refineTimer),this.refineTimer=setTimeout(()=>{this.refineTimer=null;for(let e of this.panels.values())e.coarse&&(e.underlayDirty=!0,e.rebuiltAt=-1/0);this.onChange()},tw)}drawFine(e,t,i){let r=this.scratch;(r===null||r.width<i.z||r.height<i.w)&&(r?.dispose(),r=this.scratch=fm(Math.max(i.z,r?.width??0),Math.max(i.w,r?.height??0),4)),r.viewport.set(0,0,i.z,i.w),r.scissor.set(0,0,i.z,i.w),r.scissorTest=!0,this.gl.setRenderTarget(r),this.gl.clear(!0,!1,!1),this.gl.render(e.staticScene,e.camera),this.gl.setRenderTarget(null),this.region.min.set(0,0),this.region.max.set(Math.min(i.z,t.width-i.x),Math.min(i.w,t.height-i.y)),this.gl.copyTextureToTexture(r.texture,t.texture,this.region,this.corner.set(i.x,i.y))}disposePanel(e){for(let t of e.draws.values())t.dispose();e.draws.clear(),e.controls?.dispose(),e.labels?.remove(),this.panels.delete(e.id)}replan(e,t){let i=this.ctx.scene,r;try{r=zS(i,this.ctx.geometry,t,e.id),e.error=null}catch(d){if(!(d instanceof nn))throw d;e.error=d.message,e.plan=null;for(let g of e.draws.values())g.group.visible=!1;return}let s=e.plan,a=r.view.camera??{kind:"plane",plane:"xy"};(s===null||s.viewId!==r.viewId||pm(a)!==pm(e.cameraSpec))&&this.setCamera(e,a);let o=VS(r);o!==e.content&&(e.content=o,e.needsFit=!0,e.userMoved=!1),e.plan=r;let l=new Set,c=JSON.stringify(this.ctx.theme);try{for(let d of r.layers){let g;if(d.kind==="track"){if(d.set===null)continue;let b=d.color===void 0?c:JSON.stringify(d.color);g=`track\0${r.viewId}\0${d.index}\0${d.set.id}\0${r.display}\0${d.channel??""}\0${b}`}else if(d.kind==="arrow"){if(d.set===null)continue;let b=JSON.stringify([d.layer.color??c,d.layer.opacity,d.layer.width,d.layer.head]);g=`arrow\0${r.viewId}\0${d.index}\0${d.set.id}\0${r.display}\0${d.channel}\0${b}`}else d.kind==="outline"?g=`outline\0${r.viewId}\0${d.index}\0${JSON.stringify([d.layer,d.layer.color===void 0?c:""])}`:g=`${d.kind}\0${r.viewId}\0${d.index}\0${r.display}\0${c}`;l.add(d.index);let y=e.draws.get(d.index);if(y!==void 0&&y.key===g){y.group.visible=!0;continue}y!==void 0&&(y.group.removeFromParent(),y.dispose(),e.draws.delete(d.index));let m=d.kind==="track"?new ys(this.ctx,d,r.display,g):d.kind==="arrow"?new dc(this.ctx,d,g):d.kind==="outline"?new Ma(this.ctx,d.layer,g):d.kind==="body"?new vs(this.ctx,d.layer,g):new Bi(this.ctx,d.layer,e.cameraSpec,g);m.group.renderOrder=d.index;let p=0;for(let b of m.group.children)b.renderOrder=16*d.index+p++;e.draws.set(d.index,m),m instanceof Bi&&e.box!==null&&m.layout(e.box,e.cameraSpec,wa(e.cameraSpec))}}catch(d){if(!(d instanceof nn))throw d;e.error=d.message,e.plan=null;for(let g of e.draws.values())g.group.visible=!1;return}for(let[d,g]of[...e.draws])l.has(d)||(g.group.removeFromParent(),g.dispose(),e.draws.delete(d));let h=[],u=!0;for(let d of r.layers){let g=e.draws.get(d.index);g!==void 0&&(u&&=g instanceof ys&&g.isStatic,(u?e.staticScene:e.scene).add(g.group),u&&h.push(g.key))}let f=h.join(`
`);f!==e.staticKey&&(e.staticKey=f,e.underlayDirty=!0)}advance(e,t,i){let r=e.plan;if(r===null)return;let s=this.ctx.scene,a={scope:r.scope,frames:this.ctx.geometry.frames,clock:s.clock,channel:t.clock.channel,q:i,display:r.display};e.error=null;try{for(let o of r.layers){let l=e.draws.get(o.index);l instanceof ys&&o.kind==="track"?(l.update(o,s,i)&&l.isStatic&&(e.underlayDirty=!0),l.driverContext&&l.place(a,r.driver)):l instanceof dc&&o.kind==="arrow"?l.update(a,o):l instanceof Ma&&o.kind==="outline"?l.update(a,r.driver):l instanceof vs&&o.kind==="body"&&l.update(a,o.layer,r.driver)}}catch(o){if(!(o instanceof nn))throw o;e.error=o.message}}fit(e){let t=new On,i=e.plan===null?null:$S(e.plan,this.ctx.geometry);if(i!==null)t.set(new N(i[0],i[1],i[2]),new N(i[3],i[4],i[5]));else for(let d of e.draws.values())d instanceof vs&&d.group.visible&&d.extend(t);t.isEmpty()&&t.set(new N(-1,-1,-1),new N(1,1,1));let r=e.cameraSpec,s=wa(r),a=new On(t.min.clone().multiply(s),t.max.clone().multiply(s)),o=a.getCenter(new N),l=a.getSize(new N),c=Math.max(l.length()/2,1e-9),{up:h,normal:u}=zi(r),f=e.camera;if(e.fitting=!0,f instanceof Un){({halfWidth:e.halfWidth,halfHeight:e.halfHeight}=XS(a,r,e.rect.w/Math.max(1,e.rect.h)));let d=4*c+1,g=10*(o.length()+d+c);f.near=-g,f.far=g,f.zoom=1,f.position.copy(o).addScaledVector(u,d)}else{let d=c/Math.sin(f.fov*Math.PI/360)*1.08;f.near=d/1e3,f.far=d*1e3+o.length(),f.position.copy(o).addScaledVector(u,d)}f.up.copy(h),f.lookAt(o),e.target.copy(o),e.turned=0,this.aspect(e),e.controls&&(e.controls.target.copy(o),e.controls.update());for(let d of e.draws.values())d instanceof Bi&&d.layout(t,r,s);e.box=t,e.fitting=!1,e.needsFit=!1}aspect(e){let t=e.rect.w/Math.max(1,e.rect.h),i=e.camera;i instanceof Un?(hc(e.cameraSpec)||(e.halfWidth=e.halfHeight*t),i.top=e.halfHeight,i.bottom=-e.halfHeight,i.left=-e.halfWidth,i.right=e.halfWidth):i.aspect=t,i.updateProjectionMatrix()}turn(e,t){let i=e.cameraSpec;if(i.kind!=="orbit"||i.turn===void 0)return;let r=i.turn*t*Math.PI/180,s=e.controls?.target??e.target;e.camera.position.sub(s).applyAxisAngle(zi(i).up,r-e.turned).add(s),e.camera.lookAt(s),e.turned=r}follow(e){let t=e.cameraSpec;if(e.view=t.kind==="plane"&&e.camera instanceof Un?YS(e.camera,t,e.rect.w,e.rect.h):null,!(e.view===null||t.kind!=="plane"))for(let i of e.draws.values())i instanceof Bi&&i.follow(e.view,t)}renderAt(e,t,i,r,s){let a=Math.max(1,Math.floor(i)),o=Math.max(1,Math.floor(r));(a!==this.size.w||o!==this.size.h||s!==this.size.ratio)&&(this.gl.setPixelRatio(s),this.gl.setSize(a,o,!1),this.size={w:a,h:o,ratio:s});let l=gs(e.layout,{x:0,y:0,w:a,h:o},bs);for(let u of[...this.panels.values()])Object.hasOwn(e.panels,u.id)||this.disposePanel(u);let c=e!==this.lastState;this.lastState=e;let h=new Map;this.gl.setScissorTest(!1),this.gl.setClearColor(this.background,1),this.gl.clear(),this.gl.setScissorTest(!0);for(let[u,f]of l.panels){let d=this.panel(u);(c||d.plan===null)&&this.replan(d,e);let y=f.w!==d.rect.w||f.h!==d.rect.h;d.rect=f,this.advance(d,e,t),d.needsFit||y&&!d.userMoved?this.fit(d):y&&this.aspect(d),this.turn(d,t),this.follow(d)}for(let[u,f]of l.panels){let d=this.panel(u);if(d.error!==null){h.set(u,d.error);continue}if(f.w<1||f.h<1)continue;for(let y of d.draws.values())y.resize?.(f.w,f.h);for(let y of d.draws.values())y instanceof Ma&&y.place(d,y.target===null?void 0:this.panels.get(y.target));let g=o-f.y-f.h;this.gl.setViewport(f.x,g,f.w,f.h),this.gl.setScissor(f.x,g,f.w,f.h),this.drawStatic(d),this.gl.render(d.scene,d.camera),this.placeLabels(d)}return this.gl.setScissorTest(!1),h}labelItems(e){if(e.plan===null)return[];let t=[],i=[],r=[],s=this.ctx.scene.frames[e.plan.display],a=s?.axes??["x","y","z"],{normal:o}=zi(e.cameraSpec),l=wa(e.cameraSpec),c=(f,d,g,y)=>{let m=d.clone().multiply(l).project(e.camera),p=(m.x+1)/2*e.rect.w+g,b=(1-m.y)/2*e.rect.h,_=m.z>-1&&m.z<1&&p>=0&&p<=e.rect.w&&b>=0&&b<=e.rect.h,v={text:f,x:p,y:b,hidden:y||!_};return t.push(v),v},h=[...e.draws.values()].filter(f=>f instanceof Bi);if(e.view!==null&&e.cameraSpec.kind==="plane"){let[f,d]=FS(e.cameraSpec),g=p=>a[p]&&s?.unit?`${a[p]} [${s.unit}]`:a[p]??"",y=h.some(p=>p.follows&&p.kind==="axes"),m=h.some(p=>p.ticks);for(let p of JS(e.view,m,y?[g(f),g(d)]:null)){let b={...p,hidden:!1};t.push(b),p.kind==="title"&&i.push(b)}}for(let f of e.draws.values())f instanceof Bi&&f.kind==="axes"&&!f.follows?f.tips.forEach((d,g)=>{let y=a[g]??"",m=l.getComponent(g),p=y!==""&&m!==1?`${y} \xD7${Number(m.toPrecision(4))}`:y;i.push(c(p,d,4,e.cameraSpec.kind==="plane"&&Math.abs(d.clone().normalize().dot(o))>.99))}):f instanceof vs&&f.label!==null&&f.at!==null&&f.group.visible&&r.push(c(f.label,f.at,f.size/2+3,!1));let u=r.filter(f=>!f.hidden);for(let f of i)u.some(d=>jS(f,d))&&(f.hidden=!0);return t}labels(e){let t=this.panels.get(e);return t===void 0?[]:this.labelItems(t).filter(i=>!i.hidden).map(({hidden:i,...r})=>r)}colorbars(e){let t=this.panels.get(e),i=[];if(t===void 0)return i;for(let r of t.draws.values()){if(!(r instanceof ys)||!r.group.visible)continue;let s=r.colorbar();s!==null&&i.push(s)}return nm(i)}placeLabels(e){let t=e.labels;if(t===null)return;let i=this.labelItems(e);for(;t.children.length<i.length;)t.appendChild(document.createElement("span"));for(;t.children.length>i.length;)t.lastChild.remove();i.forEach((r,s)=>{let a=t.children[s];a.textContent!==r.text&&(a.textContent=r.text),a.hidden=r.hidden;let o=r.align==="center"?"-50%":r.align==="end"?"-100%":"0";a.style.transformOrigin="0 0",a.style.fontSize=r.kind==="title"?"13px":"",a.style.transform=`translate(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px)${r.rotate?" rotate(-90deg)":""} translate(${o}, -50%)`})}dispose(){for(let e of[...this.panels.values()])this.disposePanel(e);this.refineTimer!==null&&clearTimeout(this.refineTimer),this.blit.material.dispose(),this.underlay?.dispose(),this.scratch?.dispose(),this.ctx.disc.dispose(),this.gl.dispose(),this.gl.forceContextLoss()}};var _s={frames:2e3,seconds:90},pc=[24,30,60],xm=[1,2,3,4];function mc(n,e,t,i=1,r=0,s=ho){let a=Math.round(t*s*e/i),o=l=>uo(r,l,e,n,i,s);return{count:a,duration:a/e,index:l=>fo(o(l),n),progress:l=>po(o(l),n)}}function gc(n,e){return n>=1?n>_s.frames?`${n} frames is more than the ${_s.frames} an export may have: lower the frame rate or the loops, or raise the speed`:n/e>_s.seconds?`${(n/e).toFixed(1)} s is longer than the ${_s.seconds} s an export may last: lower the loops or raise the speed`:null:`the frame count of the export is ${n}, not a count of at least one`}function bm(n,e,t=ho){for(let i of[...pc].reverse())if(gc(mc(n,i,1,e,0,t).count,i)===null)return i;return null}function Ta(n,e={w:1280,h:720},t=1,i=30){if(n==="720p")return{width:1280,height:720,pixelRatio:1};if(n==="1080p")return{width:1920,height:1080,pixelRatio:1.5};let r=l=>Math.max(2,2*Math.floor(l/2)),s=r(e.w),a=r(e.h),o={width:s,height:a,pixelRatio:1};for(let l=8*Math.min(2,Math.max(1,Math.round(t)));l>=1;l--){let c=l/8;if(o={width:r(s*c),height:r(a*c),pixelRatio:c},Sm(o.width,o.height,i))break}return o}var sw=[[30,1620,40500],[31,3600,108e3],[32,5120,216e3],[40,8192,245760],[42,8704,522240],[50,22080,589824],[51,36864,983040],[52,36864,2073600]],_m=4096;function Sm(n,e,t){return n%2===0&&e%2===0&&Math.max(n,e)<=_m&&wm(n,e,t)!==null}function wm(n,e,t,i="high"){let r=Math.ceil(n/16),s=Math.ceil(e/16),a=r*s,o=sw.find(([,c,h])=>a<=c&&a*t<=h&&Math.max(r,s)<=Math.sqrt(8*c));return o===void 0?null:`avc1.${{high:"6400",main:"4d40",baseline:"42e0"}[i]}${o[0].toString(16).padStart(2,"0")}`}function aw(n,e,t){return Math.round(Math.min(4e7,Math.max(1e6,.08*n*e*t)))}var Nu=class{muxer;constructor(e,t,i){if(e%2!==0||t%2!==0)throw new Error(`an MP4 export needs even sides, not ${e} by ${t}`);this.muxer=new Nd({target:new Qc,video:{codec:"avc",width:e,height:t,frameRate:i},fastStart:"in-memory"})}add(e,t,i,r,s){let a=s?.decoderConfig;if(a!==void 0){if(!a.codec.startsWith("avc1."))throw new Error(`an MP4 export holds H.264 only, not ${a.codec}`);if(a.description===void 0)throw new Error('the H.264 encoder did not give an avcC record. Configure it with avc: { format: "avc" }')}this.muxer.addVideoChunkRaw(e,t?"key":"delta",i,r,s)}finish(){return this.muxer.finalize(),new Uint8Array(this.muxer.target.buffer)}};function Ou(){return typeof VideoEncoder>"u"||typeof VideoFrame>"u"?"this browser does not have a WebCodecs video encoder":null}async function ow(n,e,t,i){if(!Sm(n,e,t))throw new Error(`${n} by ${e} at ${t} fps is past H.264, which needs even sides, at most ${_m} pixels a side, and a frame size and rate within level 5.2`);for(let r of["high","main","baseline"]){let s={codec:wm(n,e,t,r),width:n,height:e,bitrate:i,framerate:t,avc:{format:"avc"}};if((await VideoEncoder.isConfigSupported(s)).supported===!0)return s}throw new Error(`this browser does not have an H.264 encoder for ${n} by ${e} at ${t} fps, and an MP4 that QuickTime opens needs H.264`)}var Uu='"Helvetica Neue", Arial, sans-serif';function Mm(n){return n.kind==="panel"?n.id:Mm(n.a)}var vm=18;function Vi(n,e,t,i,r,s){n.lineJoin="round",n.lineWidth=3,n.strokeStyle=s,n.strokeText(e,t,i),n.fillStyle=r,n.fillText(e,t,i)}function lw(n,e,t,i,r,s,a=Uu){n.font=`${e.kind==="title"?13:12}px ${a}`,n.textAlign=e.align==="center"?"center":e.align==="end"?"right":"left",e.rotate?(n.save(),n.translate(t,i),n.rotate(-Math.PI/2),Vi(n,e.text,0,0,r,s),n.restore()):Vi(n,e.text,t,i,r,s),n.textAlign="left"}function cw(n,e,t,i,r,s,a,o,l=Uu){let c=t;n.font=`11px ${l}`;for(let h of[...e].reverse()){let u=sn(h.hi,3),f=sn(h.lo,3),d=Math.max(n.measureText(h.label).width,13+Math.max(n.measureText(u).width,n.measureText(f).width));c-=d,n.textBaseline="top",Vi(n,h.label,c,i,s,o);let g=i+16,y=n.createLinearGradient(0,g+120,0,g);for(let[m,p]of h.stops)y.addColorStop(m,p);if(n.fillStyle=y,n.fillRect(c,g,8,120),n.strokeStyle=a,n.lineWidth=1,n.strokeRect(c+.5,g+.5,7,119),h.band!==null){let[m,p,b]=Et(r).map(_=>Math.round(255*_));n.fillStyle=`rgba(${m}, ${p}, ${b}, 0.18)`,n.fillRect(c-3,g+120*(1-h.band[1]),14,120*(h.band[1]-h.band[0]))}if(Vi(n,u,c+13,g,s,o),n.textBaseline="bottom",Vi(n,f,c+13,g+120,s,o),h.marker!==null){let m=g+120*(1-h.marker);n.fillStyle=r,n.beginPath(),n.moveTo(c-1,m),n.lineTo(c-7,m-4),n.lineTo(c-7,m+4),n.closePath(),n.fill()}c-=12}}async function Em(n,e={}){let t=Ou();if(t!==null)throw new Error(t);let{scene:i,geometry:r}=n,s=structuredClone(n.state),a=e.fps??30,o=typeof e.size=="object"?e.size:Ta(e.size??"720p",n.stage,typeof window>"u"?1:window.devicePixelRatio,a),l=mc(i.clock.steps,a,e.loops??1,e.speed??1,e.start??0,Ur(i.clock)),c=gc(l.count,a);if(c!==null)throw new Error(c);let{width:h,height:u,pixelRatio:f}=o,d=e.signal,g=()=>new DOMException("the export was canceled","AbortError");if(d?.aborted)throw g();let y=await ow(h,u,a,e.bitrate??aw(h,u,a));e.onConfig?.(y);let m=new Nu(h,u,a),p=null,b=new VideoEncoder({output:(Ue,qe)=>{let $=new Uint8Array(Ue.byteLength);Ue.copyTo($);try{m.add($,Ue.type==="key",Ue.timestamp,Ue.duration??Math.round(1e6/a),qe)}catch(Z){p??=Z}},error:Ue=>p=Ue});b.configure(y);let _=n.theme??Ir(i),v=n.font??Uu,E=Ut(_.background,_.background,0),A=Ut(_.foreground,_.foreground,0),P=Ut(_.foreground,_.background,.4),k=Ut(_.foreground,_.background,.8),w=Ut(_.foreground,_.background,.9),M=(i.readouts??[]).filter(Ue=>Ue.place==="caption"),L=(i.readouts??[]).filter(Ue=>Ue.place==="panel"),V=h/f,W=u/f,Y=M.length>0?10+vm*M.length:0,j=Math.floor(V),X=Math.floor(W-Y),re=document.createElement("canvas"),H=new xs(re,i,r,{preserveDrawingBuffer:!0,coarseDrags:!1,theme:_}),oe=document.createElement("canvas");oe.width=h,oe.height=u;let ee=oe.getContext("2d",{alpha:!1}),Me=gs(s.layout,{x:0,y:0,w:j,h:X},bs),$e=Mm(s.layout),rt=(Ue,qe,$,Z)=>{try{return Qd({scene:i,geometry:r,state:s,panel:Ue,frameIndex:$,progress:Z},qe)}catch(me){return me.message}};try{for(let Ue=0;Ue<l.count;Ue++){if(d?.aborted)throw g();if(p!==null)throw p;let qe=l.index(Ue),$=l.progress(Ue),Z=H.renderAt(s,$,j,X,f);ee.setTransform(1,0,0,1,0,0),ee.fillStyle=E,ee.fillRect(0,0,h,u),ee.drawImage(re,0,0),ee.setTransform(f,0,0,f,0,0),ee.fillStyle=w;for(let ve of Me.gutters)ee.fillRect(ve.rect.x,ve.rect.y,ve.rect.w,ve.rect.h);for(let[ve,ue]of Me.panels){ee.save(),ee.beginPath(),ee.rect(ue.x,ue.y,ue.w,ue.h),ee.clip(),ee.textBaseline="middle";for(let C of H.labels(ve))lw(ee,C,ue.x+C.x,ue.y+C.y,A,E,v);cw(ee,H.colorbars(ve),ue.x+ue.w-10,ue.y+10,A,P,k,E,v),ee.font=`13px ${v}`,ee.textBaseline="bottom",L.map(C=>rt(ve,C.parts,qe,$)).join(`
`).split(`
`).reverse().forEach((C,dt)=>Vi(ee,C,ue.x+8,ue.y+ue.h-6-17*dt,A,E));let Ct=Z.get(ve);Ct!==void 0&&(ee.textBaseline="top",Vi(ee,Ct,ue.x+12,ue.y+12,"#e0a24a",E)),ee.restore()}ee.font=`13px ${v}`,ee.textBaseline="alphabetic",M.forEach((ve,ue)=>Vi(ee,rt($e,ve.parts,qe,$),14,X+5+vm*(ue+1)-4,A,E));let me=new VideoFrame(oe,{timestamp:Math.round(Ue*1e6/a),duration:Math.round(1e6/a)});for(b.encode(me,{keyFrame:Ue%(2*a)===0}),me.close(),e.onProgress?.(Ue+1,l.count);b.encodeQueueSize>4;)await new Promise(ve=>setTimeout(ve,1));await new Promise(ve=>setTimeout(ve,0))}if(await b.flush(),p!==null)throw p}finally{b.state!=="closed"&&b.close(),H.dispose()}return new Blob([m.finish()],{type:"video/mp4"})}var Tm="http://www.w3.org/2000/svg",Am=(n,e)=>`M${n-1} ${e}a1 1 0 1 0 2 0a1 1 0 1 0-2 0`,hw={house:{grid:24,fill:!1,d:["M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8","M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"]},chevronDown:{grid:24,fill:!1,d:["m6 9 6 6 6-6"]},grip:{grid:24,fill:!1,d:[[5,12,19].map(n=>Am(9,n)).join(""),[5,12,19].map(n=>Am(15,n)).join("")]},x:{grid:24,fill:!1,d:["M18 6 6 18","m6 6 12 12"]},rotateCcw:{grid:24,fill:!1,d:["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8","M3 3v5h5"]},plus:{grid:24,fill:!1,d:["M5 12h14","M12 5v14"]},download:{grid:24,fill:!1,d:["M12 15V3","M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4","m7 10 5 5 5-5"]},play:{grid:16,fill:!0,d:["M5 3.5v9l7.5-4.5z"]},pause:{grid:16,fill:!0,d:["M4.5 3H7v10H4.5zM9 3h2.5v10H9z"]}};function Zn(n,e){let t=hw[n],i=document.createElementNS(Tm,"svg"),r={viewBox:`0 0 ${t.grid} ${t.grid}`,"aria-hidden":"true",focusable:"false",fill:t.fill?"currentColor":"none",stroke:t.fill?"none":"currentColor"};t.fill||Object.assign(r,{"stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round"});for(let[s,a]of Object.entries(r))i.setAttribute(s,a);i.setAttribute("class",e===void 0?`i i-${n}`:`i i-${n} ${e}`);for(let s of t.d){let a=document.createElementNS(Tm,"path");a.setAttribute("d",s),i.appendChild(a)}return i}function yc(n){return n?n.kind==="panel"?[n.id]:[...yc(n.a),...yc(n.b)]:[]}function Aa(n,e,t,i){if(n.kind==="panel"){if(n.id!==e)return n;if(i==="centre")return{kind:"panel",id:t};let r={kind:"panel",id:t},s=i==="left"||i==="right"?"row":"col",a=i==="left"||i==="top";return{kind:"split",dir:s,ratio:.5,a:a?r:n,b:a?n:r}}return{...n,a:Aa(n.a,e,t,i),b:Aa(n.b,e,t,i)}}function Ca(n,e){if(n.kind==="panel")return n.id===e?null:n;let t=Ca(n.a,e),i=Ca(n.b,e);return t?i?{...n,a:t,b:i}:t:i}function vc(n,e=1){return n.kind==="panel"?[{id:n.id,area:e}]:[...vc(n.a,e*n.ratio),...vc(n.b,e*(1-n.ratio))]}function Cm(n,e,t,i){let r=n/Math.max(1,t),s=e/Math.max(1,i),a=.28,o=[{zone:"left",v:r},{zone:"right",v:1-r},{zone:"top",v:s},{zone:"bottom",v:1-s}].sort((l,c)=>l.v-c.v)[0];return o.v<a?o.zone:"centre"}function _c(){return Object.create(null)}function xc(n,e,t){let i=_c();for(let[r,s]of Object.entries(n??{}))r!==e&&s!==void 0&&(i[r]=s);return t!==void 0&&(i[e]=t),i}var uw=(n,e)=>(n%e+e)%e,bc=class{snap;index=0;play=!1;steps;listeners=new Set;constructor(e,t){this.snap=e,this.steps=t}get state(){return this.snap}get frame(){return this.index}get playing(){return this.play}subscribe(e){return this.listeners.add(e),()=>this.listeners.delete(e)}emit(e){for(let t of[...this.listeners])t(e)}set(e){e!==this.snap&&(this.snap=e,this.emit("state"))}update(e){this.set(e(this.snap))}setFrame(e){if(!Number.isInteger(e))return;let t=uw(e,this.steps);t!==this.index&&(this.index=t,this.emit("frame"))}setPlaying(e){e!==this.play&&(this.play=e,this.emit("playing"))}};function Hi(n,e,t,i,r){let s=it(n,t);if(s===void 0||!Oa(s,i))return e;if(s.scope==="panel"){if(r===void 0||!Object.hasOwn(e.panels,r))return e;let a=e.panels[r];return a.variables!==void 0&&Object.hasOwn(a.variables,t)&&a.variables[t]===i?e:Fu(e,r,{...a,variables:xc(a.variables,t,i)})}return e.variables!==void 0&&Object.hasOwn(e.variables,t)&&e.variables[t]===i?e:{...e,variables:xc(e.variables,t,i)}}function Pm(n,e){return n.clock.channel===e?n:{...n,clock:{channel:e}}}function Fu(n,e,t){return{...n,panels:xc(n.panels,e,t)}}function Ra(n,e){return{...n,layout:e}}function Im(n,e){if(!Object.hasOwn(n.panels,e)||Object.keys(n.panels).length<2)return n;let t=Ca(n.layout,e);return t===null?n:{...n,panels:xc(n.panels,e,void 0),layout:t}}function dw(n){for(let e=Object.keys(n.panels).length+1;;e++){let t=`p${e}`;if(!Object.hasOwn(n.panels,t))return t}}function Bu(n,e,t){return n.kind==="panel"?n.id===e?{kind:"panel",id:t}:n.id===t?{kind:"panel",id:e}:n:{...n,a:Bu(n.a,e,t),b:Bu(n.b,e,t)}}function Sc(n,e,t,i,r,s=1/0){if(!Object.hasOwn(e.panels,t))return e;let a=e.panels[t];if(r.kind==="panel"){if(r.id===t||!Object.hasOwn(e.panels,r.id))return e;if(i==="centre")return Ra(e,Bu(e.layout,r.id,t));let h=Ca(e.layout,r.id);return h===null?e:Ra(e,Aa(h,t,r.id,i))}if(i==="centre")return r.kind==="view"?Object.hasOwn(n.views,r.view)?Fu(e,t,{...a,view:r.view}):e:Hi(n,e,r.variable,r.value,t);if(Object.keys(e.panels).length>=s)return e;let o=dw(e),l={view:a.view,variables:Object.assign(_c(),a.variables)};if(r.kind==="view"){if(!Object.hasOwn(n.views,r.view))return e;l.view=r.view}let c=Ra(Fu(e,o,l),Aa(e.layout,t,o,i));return r.kind==="value"?Hi(n,c,r.variable,r.value,o):c}function Vu(n,e,t,i,r){if(Object.keys(e.panels).length>=i)return e;let s=vc(e.layout).reduce((a,o)=>o.area>a.area?o:a);return Sc(n,e,s.id,r(s.id)?"bottom":"right",t,i)}function Lm(n,e,t){let i=Object.keys(n.panels).length>=t,r=yc(n.layout),s=r.map(e),a=[{label:"Add panel",placement:{kind:"add"},disabled:i,group:!1}];return r.forEach((o,l)=>{let h=s.filter(u=>u===s[l]).length>1?`${s[l]} (${s.slice(0,l+1).filter(u=>u===s[l]).length})`:s[l];a.push({label:`Split ${h} right`,placement:{kind:"drop",target:o,zone:"right"},disabled:i,group:!0},{label:`Split ${h} below`,placement:{kind:"drop",target:o,zone:"bottom"},disabled:i,group:!1},{label:`Replace ${h}`,placement:{kind:"drop",target:o,zone:"centre"},disabled:!1,group:!1})}),a}function Dm(n,e,t,i,r,s){return t.kind==="add"?Vu(n,e,i,r,s):Sc(n,e,t.target,t.zone,i,r)}function fw(n){let e=new TextEncoder().encode(n),t=2166136261;for(let i of e)t^=i,t=Math.imul(t,16777619)>>>0;return t.toString(16).padStart(8,"0")}function wc(n){return`tycho:state:${fw(n)}:${n.length}`}var Ss=n=>n!==null&&typeof n=="object"&&!Array.isArray(n);function Rm(n,e,t){let i=_c();if(!Ss(e))return i;for(let[r,s]of Object.entries(e)){let a=it(n,r);a===void 0||a.scope==="panel"!=(t==="panel")||!Oa(a,s)||(i[r]=s)}return i}function zu(n,e,t){if(!Ss(n))return;if(n.kind==="panel")return typeof n.id!="string"?void 0:!e(n.id)||t.has(n.id)?null:(t.add(n.id),{kind:"panel",id:n.id});if(n.kind!=="split"||n.dir!=="row"&&n.dir!=="col")return;let i=zu(n.a,e,t),r=zu(n.b,e,t);if(i===void 0||r===void 0)return;if(i===null)return r;if(r===null)return i;let s=n.ratio,a=typeof s=="number"&&s>0&&s<1?s:.5;return{kind:"split",dir:n.dir,ratio:a,a:i,b:r}}function km(n,e){let t=()=>structuredClone(n.initial);if(!Ss(e)||!Ss(e.clock)||!Ss(e.panels))return t();let i=e.clock.channel;if(typeof i!="string"||!n.clock.channels.includes(i))return t();let r=_c();for(let[c,h]of Object.entries(e.panels))!ka.test(c)||!Ss(h)||typeof h.view!="string"||!Object.hasOwn(n.views,h.view)||(r[c]={view:h.view,variables:Rm(n,h.variables,"panel")});let s=zu(e.layout,c=>Object.hasOwn(r,c),new Set);if(s==null)return t();let a=new Set,o=c=>c.kind==="panel"?void a.add(c.id):(o(c.a),o(c.b));o(s);for(let c of Object.keys(r))a.has(c)||delete r[c];if(Object.keys(r).length===0)return t();let l={variables:Rm(n,e.variables,"scene"),clock:{channel:i},panels:r,layout:s};try{Ar(n,l)}catch{return t()}return l}var Mc=8,pw=[.25,.5,1,2,4],mw=`
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
.root.kiosk header, .root.kiosk .stats, .root.kiosk footer, .root.kiosk .phead { display: none; }
.root.lean:not(.keep-panels) .add, .root.lean:not(.keep-panels) .phead .icon, .root.lean .frame, .root.lean .fps, .root.lean .cap.view, .root.lean .cap.export { display: none; }
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

.stage { position: relative; min-height: 120px; overflow: hidden; background: var(--gutter); }
.stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.panels { position: absolute; inset: 0; }
.panel { position: absolute; overflow: hidden; }
.pbody { position: absolute; inset: 0; }
.phead { position: absolute; top: 0; left: 0; right: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px;
  padding: 3px 3px 3px 6px; background: var(--head); cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none;
  font-size: 12px; white-space: nowrap; min-width: 0; }
.phead .t { font-weight: 600; flex: 0 1 auto; min-width: 2em; overflow: hidden; text-overflow: ellipsis; }
.phead .m { color: var(--dim); flex: 0 10 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.phead .pc { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; flex: 0 1 auto; min-width: 0; }
.phead select { padding: 0 4px; font-size: 11px; }
.phead .sp { flex: 1 0 0; }
.phead .icon { width: 24px; height: 24px; }
.phead .chip { min-width: 0; }
.phead .chip .body { padding: 1px 6px 1px 2px; min-width: 0; }
.phead .chip .lbl { overflow: hidden; text-overflow: ellipsis; }
.phead .chip .grip { visibility: hidden; }
.phead .chip:is(:hover, :focus-within) .grip { visibility: visible; }
.labels, .preadout, .perror, .drop, .cbars { pointer-events: none; }
.labels { position: absolute; inset: 0; z-index: 1; overflow: hidden; }
.labels span { position: absolute; left: 0; top: 0; white-space: nowrap; color: var(--fg); font-size: 12px; text-shadow: 0 0 3px var(--bg), 0 0 3px var(--bg); }
.cbars { position: absolute; right: 10px; top: 40px; z-index: 1; display: flex; gap: 12px; }
.cbar { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; font-size: 11px; color: var(--dim); }
.cbar-t { max-width: 9em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cbar-b { display: flex; gap: 5px; height: 120px; }
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
`;function se(n,e,t){let i=document.createElement(n);return e!==void 0&&(i.className=e),t!==void 0&&(i.textContent=t),i}function zn(n,e){n.textContent!==e&&(n.textContent=e)}var Kn=n=>n.stopPropagation();function ws(n,e,t,i="icon"){let r=se("button",i);return r.type="button",r.setAttribute("aria-label",e),r.title=t,r.appendChild(Zn(n)),r.addEventListener("pointerdown",Kn),r}function Hu(n,e){let t=se("div",e===void 0?"cap":`cap ${e}`);return t.setAttribute("role","group"),t.setAttribute("aria-label",n),t}function Nm(n,e,t){let i=se("div","seg");i.setAttribute("role","group"),t!==void 0&&i.setAttribute("aria-label",t);let r=new Map;for(let s of n){let a=se("button",void 0,s.label);a.type="button",a.setAttribute("aria-pressed","false"),a.addEventListener("pointerdown",Kn),a.addEventListener("click",()=>e(s.id)),r.set(s.id,a),i.appendChild(a)}return{el:i,set(s){for(let[a,o]of r)o.setAttribute("aria-pressed",String(a===s))}}}function Gu(n,e){n.value=String(e);let t=Number(n.max)-Number(n.min);n.style.setProperty("--p",`${t>0?100*(Number(n.value)-Number(n.min))/t:0}%`)}function Om(n,e){let t=se("div","chip"),i=se("span","body"),r=se("span","lbl",n);i.append(Zn("grip","grip"),r),t.appendChild(i);let s=null,a=null;if(e==="menu")s=se("button","caret"),s.type="button",s.setAttribute("aria-haspopup","menu"),s.setAttribute("aria-expanded","false"),s.setAttribute("aria-label",`${n}: placement`),s.title="Add, split, or replace a panel",s.appendChild(Zn("chevronDown")),s.addEventListener("pointerdown",Kn),t.appendChild(s);else if(e==="select"){let o=se("span","caret");a=se("select"),o.append(Zn("chevronDown"),a),o.addEventListener("pointerdown",Kn),t.appendChild(o)}return{root:t,body:i,label:r,button:s,select:a}}function Um(n,e){let t=ef(n),i=se("div",`readout ${e}`),r=se("div","line"),s=null,a=[];if(t!==null){s=se("dl");for(let o of t){let l=se("div"),c=se("dd"),h=se("b");o.width!==null&&(h.style.minWidth=`${o.width}ch`),c.appendChild(h),o.unit!==""&&c.appendChild(se("span","u",o.unit)),l.append(se("dt",void 0,o.label),c),s.appendChild(l),a.push(h)}i.appendChild(s),r.hidden=!0}return i.appendChild(r),{parts:n,tiles:t,root:i,list:s,values:a,line:r}}function Fm(n,e){let t=Array.isArray(e);if(t&&n.tiles!==null&&n.list!==null&&e.length>0){n.list.hidden=!1,n.line.hidden=!0,n.tiles.forEach((i,r)=>zn(n.values[r],e[i.part]??""));return}n.list!==null&&(n.list.hidden=!0),n.line.hidden=!1,zn(n.line,t?e.join(""):e.error)}function gw(n,e){let t=n.kind==="panel";if(e==="centre")return t?"swap":"replace";let i={left:"left",right:"right",top:"above",bottom:"below"}[e];return`${t?"move":"split"} ${i}`}function yw(){return typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}var vw=typeof HTMLElement>"u"?class{}:HTMLElement,Pa=class extends vw{static observedAttributes=["theme"];scene=null;sceneText="";geometry=null;store=null;renderer=null;theme=null;kiosk=!1;lean=!1;keepPanels=!1;loading=!1;loads=0;choice=null;root;header;titleEl;varsEl;addEl;stage;panelsEl;statusEl;statsEl;footer;canvas=null;panelDom=new Map;gutterDom=new Map;gutters=[];sceneWidgets=[];captions=[];addChips=[];addButton=null;addGroup=null;transport=null;menu=null;closeExport=null;raf=0;intersecting=!0;shown=!1;viewObserver=null;onVisibility=()=>this.syncShown();dirty=!0;anchor={index:0,time:0};playProgress=null;speed=1;meter=new lo;stageSize={w:0,h:0};saveTimer=0;resizeObserver=null;onPageHide=()=>this.flushSave();unsubscribe=null;lastPanels=null;lastLayout=null;refreshExport=null;connectedCallback(){if(this.shadowRoot===null&&this.buildShell(),this.scene!==null){this.applyTheme(),this.start();return}this.loading||(this.loading=!0,document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{this.loadFromSources()},{once:!0}):this.loadFromSources())}disconnectedCallback(){this.stop()}attributeChangedCallback(){this.applyTheme()}buildShell(){this.kiosk=this.hasAttribute("kiosk"),this.lean=this.hasAttribute("lean"),this.keepPanels=this.lean&&(this.getAttribute("lean")??"").split(/\s+/).includes("panels");let e=this.attachShadow({mode:"open"}),t=se("style");t.textContent=mw,e.appendChild(t),this.root=se("div",`root${this.kiosk?" kiosk":""}${this.lean?" lean":""}${this.keepPanels?" keep-panels":""}`),this.header=se("header"),this.titleEl=se("h1"),this.varsEl=se("div","vars"),this.varsEl.setAttribute("role","group"),this.varsEl.setAttribute("aria-label","Scene"),this.addEl=se("div","add"),this.addEl.setAttribute("role","group"),this.addEl.setAttribute("aria-label","Add panel"),this.header.append(this.titleEl,this.varsEl,this.addEl),this.stage=se("div","stage"),this.panelsEl=se("div","panels"),this.statusEl=se("div","status","loading\u2026"),this.stage.append(this.panelsEl,this.statusEl),this.statsEl=se("div","stats"),this.footer=se("footer"),this.root.append(this.header,this.stage,this.statsEl,this.footer),e.appendChild(this.root),this.hasAttribute("tabindex")||(this.tabIndex=0),this.addEventListener("keydown",i=>this.onKey(i))}fail(e){this.statusEl.hidden=!1,this.statusEl.className="status error",this.statusEl.textContent=e}select(e){let t=this.getRootNode();try{return t.querySelector?.(e)??document.querySelector(e)}catch{return null}}source(e){for(let r of this.children)if(r.tagName==="SCRIPT"&&r.getAttribute("data-tycho")===e)return r;let t=this.getAttribute(e);if(!t)return this.select(`#tycho-${e}`);let i=this.select(t);if(i===null&&t.startsWith("#"))throw new Error(`the ${e} selector ${t} does not match an element`);return i??t}async read(e){if(typeof e!="string")return Da(e.textContent??"",e.getAttribute("data-encoding")??"base64");let t=await fetch(e);if(!t.ok)throw new Error(`${e} answered ${t.status}`);return new Uint8Array(await t.arrayBuffer())}async loadFromSources(){try{let e=this.source("scene"),t=this.source("data");if(e===null&&t===null){this.loading=!1;return}if(e===null||t===null)throw new Error(`the ${e===null?"scene":"data"} is missing`);let[i,r]=await Promise.all([this.read(e),this.read(t)]);if(this.loads>0)return;await this.load(new TextDecoder("utf-8").decode(i),r)}catch(e){this.fail(`the scene did not load: ${e.message}`)}}async load(e,t){this.shadowRoot===null&&this.buildShell();let i=++this.loads,r,s;try{if(r=JSON.parse(e),s=await Er.parse(t),i!==this.loads)return;for(let a of $a(r,s))console.warn(`TyCHO: ${a}`)}catch(a){if(i!==this.loads)return;this.stop(),this.fail(a instanceof nn?a.message:`the scene cannot be read: ${a.message}`);return}this.stop(),this.scene=r,this.sceneText=e,this.geometry=new ro(r,s),this.store=new bc(this.recall(),r.clock.steps),this.choice=this.templateChoice(),this.statusEl.hidden=!0,this.applyTheme(),this.titleEl.textContent=r.title??"",this.buildTopBar(),this.buildFooter(),this.start(),(this.kiosk||this.hasAttribute("autoplay"))&&!yw()&&this.play()}start(){if(!(this.scene===null||this.store===null||this.renderer!==null||!this.isConnected)){this.canvas=se("canvas"),this.stage.insertBefore(this.canvas,this.panelsEl);try{this.renderer=new xs(this.canvas,this.scene,this.geometry,{theme:this.theme})}catch(e){this.fail(`WebGL is not available: ${e.message}`);return}this.renderer.onChange=()=>this.invalidate(),this.unsubscribe=this.store.subscribe(e=>this.onChange(e)),this.measureStage(),this.resizeObserver=new ResizeObserver(()=>{this.measureStage(),this.layoutDom(),this.fitAddGroup(),this.invalidate()}),this.resizeObserver.observe(this.stage),this.resizeObserver.observe(this.header),window.addEventListener("pagehide",this.onPageHide),document.addEventListener("visibilitychange",this.onVisibility),typeof IntersectionObserver<"u"&&(this.intersecting=!1,this.viewObserver=new IntersectionObserver(e=>{this.intersecting=e[e.length-1].isIntersecting,this.syncShown()},{threshold:0}),this.viewObserver.observe(this)),this.lastPanels=null,this.lastLayout=null;for(let e of[...this.panelDom.keys()])this.removePanelDom(e);this.onChange("state"),this.store.playing&&this.onChange("playing"),this.syncShown()}}stop(){cancelAnimationFrame(this.raf),this.raf=0,this.shown=!1,document.removeEventListener("visibilitychange",this.onVisibility),this.viewObserver?.disconnect(),this.viewObserver=null,this.flushSave(),this.closeMenu(!1),window.removeEventListener("pagehide",this.onPageHide),this.unsubscribe?.(),this.unsubscribe=null,this.resizeObserver?.disconnect(),this.resizeObserver=null,this.renderer?.dispose(),this.renderer=null,this.canvas?.remove(),this.canvas=null}hostProperty(e){return typeof getComputedStyle>"u"?"":getComputedStyle(this).getPropertyValue(e).trim()}applyTheme(){if(this.scene!==null){this.theme=md(Ir(this.scene),this.getAttribute("theme"),e=>this.hostProperty(e));for(let[e,t]of Object.entries(gd(this.theme)))this.style.setProperty(e,t);this.renderer?.setTheme(this.theme),this.invalidate()}}recall(){let e=this.scene;if(this.kiosk)return structuredClone(e.initial);try{let t=localStorage.getItem(wc(this.sceneText));return t===null?structuredClone(e.initial):km(e,JSON.parse(t))}catch{return structuredClone(e.initial)}}save(){this.kiosk||(window.clearTimeout(this.saveTimer),this.saveTimer=window.setTimeout(()=>this.flushSave(),300))}flushSave(){if(!(this.saveTimer===0||this.store===null)){window.clearTimeout(this.saveTimer),this.saveTimer=0;try{localStorage.setItem(wc(this.sceneText),JSON.stringify(this.store.state))}catch{}}}reset(){if(!(this.scene===null||this.store===null)){try{localStorage.removeItem(wc(this.sceneText))}catch{}this.closeMenu(!1),this.store.set(structuredClone(this.scene.initial));for(let e of this.panelDom.keys())this.renderer?.refit(e)}}get state(){return this.store?.state??null}onChange(e){let t=this.store;if(e==="state"){let i=t.state;i.panels!==this.lastPanels&&this.syncPanels(),(i.layout!==this.lastLayout||i.panels!==this.lastPanels)&&this.layoutDom(),this.lastPanels=i.panels,this.lastLayout=i.layout,this.syncWidgets(),this.save()}else if(e==="playing"){let i=this.transport;if(i!==null){let r=t.playing?"Pause (k)":"Play (k)";i.play.replaceChildren(Zn(t.playing?"pause":"play")),i.play.setAttribute("aria-label",r),i.play.title=r,i.play.classList.toggle("on",t.playing)}this.meter.reset(),this.playProgress=null,i!==null&&this.showRate(null),t.playing&&(this.anchor={index:t.frame,time:performance.now()})}this.invalidate()}invalidate(){this.dirty=!0,this.schedule()}schedule(){this.raf===0&&this.renderer!==null&&this.shown&&(this.raf=requestAnimationFrame(e=>this.tick(e)))}syncShown(){let e=this.intersecting&&!document.hidden;if(e!==this.shown){if(this.shown=e,!e){cancelAnimationFrame(this.raf),this.raf=0;return}this.store?.playing&&(this.meter.reset(),this.anchor={index:this.playPosition(),time:performance.now()}),this.invalidate()}}playPosition(){return this.playProgress===null?this.store.frame:this.playProgress*this.scene.clock.steps}tick(e){this.raf=0;let t=this.store,i=this.scene.clock;if(t.playing){let r=uo(this.anchor.index,e-this.anchor.time,1e3,i.steps,this.speed,Ur(i));t.setFrame(fo(r,i.steps)),this.playProgress=po(r,i.steps),this.dirty=!0}this.dirty&&(this.dirty=!1,this.draw(),t.playing&&this.countDraw(e)),t.playing&&this.schedule()}countDraw(e){this.meter.note(e),this.showRate(this.meter.report(e))}showRate(e){let t=this.transport;if(t===null)return;zn(t.fps,fh(e));let i=ph(e);t.fps.title!==i&&(t.fps.title=i)}measureStage(){this.stageSize={w:this.stage.clientWidth,h:this.stage.clientHeight}}draw(){let e=this.renderer,t=this.store,i=this.scene;if(e===null)return;let r=t.state,{w:s,h:a}=this.stageSize;if(s<1||a<1)return;let o=t.playing&&this.playProgress!==null?this.playProgress:t.frame/i.clock.steps,l=e.renderAt(r,o,s,a,Math.min(window.devicePixelRatio||1,2));for(let[h,u]of this.panelDom){zn(u.error,l.get(h)??"");for(let f of u.readouts)Fm(f,this.pieces(h,f.parts,o));u.barsFor!==r&&(this.syncBars(h,u),u.barsFor=r)}let c=this.firstPanel();for(let h of this.captions)Fm(h,c===null?[]:this.pieces(c,h.parts,o));this.transport&&(Gu(this.transport.scrub,t.frame),zn(this.transport.frame,`${t.frame} / ${i.clock.steps}`))}pieces(e,t,i){try{let r={scene:this.scene,geometry:this.geometry,state:this.store.state,panel:e,frameIndex:this.store.frame,progress:i};return dh(r,t)}catch(r){if(r instanceof nn)return{error:r.message};throw r}}firstPanel(){let e=t=>t.kind==="panel"?t.id:e(t.a);return this.store===null?null:e(this.store.state.layout)}hasTransport(){return(this.scene?.controls??[]).some(e=>e.kind==="transport")}get playing(){return this.store?.playing??!1}play(){this.store?.setPlaying(!0)}pause(){this.store?.setPlaying(!1)}step(e){let t=this.store;t!==null&&(this.pause(),t.setFrame(t.frame+e))}seek(e){let t=this.store;t.setFrame(e),this.playProgress=null,t.playing&&(this.anchor={index:t.frame,time:performance.now()})}onKey(e){this.useKey(e)&&e.stopPropagation()}useKey(e){if(this.store===null||e.metaKey||e.ctrlKey||e.altKey)return!1;if(e.key==="Escape"){if(this.menu!==null)this.closeMenu(!0);else if(!this.closeExport?.())return!1;return e.preventDefault(),!0}let t=tf(e.key,e.shiftKey,this.scene.clock.steps),i=e.composedPath()[0];return i!==void 0&&["INPUT","SELECT","BUTTON","TEXTAREA"].includes(i.tagName)&&nf(i.tagName,i.type,e.key)?!0:t===null?!1:t.kind==="fit"?(e.preventDefault(),this.fitAll(),!0):t.kind==="slider"?this.stepSlider(t.by)?(e.preventDefault(),!0):!1:!this.hasTransport()&&!this.kiosk?!1:(e.preventDefault(),t.kind==="toggle"?this.store.setPlaying(!this.store.playing):t.kind==="step"?this.step(t.by):this.seek(t.frame),!0)}fitAll(){this.renderer?.refitAll(),this.invalidate()}fitPanel(e){this.renderer?.refit(e),this.invalidate()}stepSlider(e){let t=this.scene,i=this.store.state,r=this.firstPanel(),s=(t.controls??[]).find(h=>h.kind==="slider"&&it(t,h.variable)?.scope!=="panel");if(s===void 0||r===null)return!1;let a={scene:t,state:i,panel:i.panels[r]},o=co(a,this.geometry.sets,s);if(o.length===0)return!1;let l=this.panelValue(a,s.variable),c=Math.min(o.length-1,Math.max(0,Hs(o,l)+e));return this.store.update(h=>Hi(t,h,s.variable,o[c])),!0}buildFooter(){let e=this.scene;if(this.footer.replaceChildren(),this.transport=null,this.hasTransport()){let s=Hu("Playback","playback"),a=ws("play","Play (k)","Play (k)","icon play");a.addEventListener("click",()=>this.store.setPlaying(!this.store.playing));let o=se("input","scrub");o.type="range",o.min="0",o.max=String(e.clock.steps-1),o.step="1",o.setAttribute("aria-label","Frame"),o.addEventListener("pointerdown",Kn),o.addEventListener("input",()=>{this.pause(),this.store.setFrame(Number(o.value))});let l=se("span","frame");l.style.minWidth=`${2*String(e.clock.steps).length+3}ch`,l.title="Frame index of the loop. Left and right step, Home goes to 0";let c=se("select","speed");c.setAttribute("aria-label","Playback speed"),c.title="Playback speed";for(let f of pw){let d=se("option",void 0,`${f}\xD7`);d.value=String(f),d.selected=f===this.speed,c.appendChild(d)}c.addEventListener("change",()=>{this.speed=Number(c.value),this.anchor={index:this.playPosition(),time:performance.now()},this.refreshExport?.()}),s.append(a,o,l,c);let h=null;e.clock.channels.length>1&&(h=Nm(e.clock.channels.map((f,d)=>({id:f,label:e.clock.labels?.[d]??f})),f=>this.store.update(d=>Pm(d,f)),"Clock"),h.el.title="What the frame index runs along",s.append(h.el));let u=se("span","fps",fh(null));u.title=ph(null),s.append(u),this.footer.append(s),this.transport={play:a,scrub:o,frame:l,fps:u,channel:h}}let t=Hu("View","view"),i=ws("house","Reset every view","Reset every view: fit each panel to what it draws (F)");i.addEventListener("click",()=>this.fitAll());let r=ws("rotateCcw","Reset scene","Reset scene: panels, layout, and controls as written");r.addEventListener("click",()=>this.reset()),t.append(i,r),this.footer.append(t),this.buildExport()}exportVideo(e={}){if(this.scene===null||this.store===null||this.geometry===null)return Promise.reject(new Error("the viewer has not loaded a scene"));let t={w:this.stage.clientWidth,h:this.stage.clientHeight},i=this.hostProperty("--tycho-font"),r={...this.theme===null?{}:{theme:this.theme},...i===""?{}:{font:i}};return Em({scene:this.scene,geometry:this.geometry,state:this.store.state,stage:t,...r},{speed:this.speed,...e})}buildExport(){let e=Hu("Export","export"),t=se("button","disclose");t.type="button",t.append(Zn("download"),se("span",void 0,"Export video"),Zn("chevronDown","chev"));let i=se("div","exportbar");e.appendChild(t),this.footer.appendChild(e),this.closeExport=null;let r=Ou();if(r!==null){t.disabled=!0,this.footer.append(se("span","why",`video export is unavailable: ${r}`));return}let s=se("span","xprog");s.hidden=!0,t.appendChild(s),i.id="xbar",i.setAttribute("role","group"),i.setAttribute("aria-label","Export options"),i.hidden=!0,t.setAttribute("aria-expanded","false"),t.setAttribute("aria-controls","xbar");let a=v=>{i.hidden=!v,t.setAttribute("aria-expanded",String(v)),v&&(b(),_())};this.closeExport=()=>i.hidden?!1:(a(!1),t.focus(),!0),t.addEventListener("click",()=>a(i.hidden!==!1));let o=(v,E)=>{let A=se("select");A.setAttribute("aria-label",v),A.title=v;for(let[P,k]of E){let w=se("option",void 0,k);w.value=P,A.appendChild(w)}return A},l=o("Size",[["720p","1280\xD7720"],["1080p","1920\xD71080"],["stage","stage size"]]),c=o("Frame rate",pc.map(v=>[String(v),`${v} fps`]));c.value="30";let h=()=>Ta("stage",{w:this.stage.clientWidth,h:this.stage.clientHeight},window.devicePixelRatio||1,Number(c.value)),u=o("Loops",xm.map(v=>[String(v),v===1?"1 loop":`${v} loops`])),f=se("span","info"),d=se("button","btn primary","Start");d.type="button";let g=se("progress");g.hidden=!0;let y=se("button","btn","Cancel");y.type="button",y.hidden=!0;let m=ws("x","Close export options","Close (Esc)");m.addEventListener("click",()=>{a(!1),t.focus()});let p=null,b=()=>{if(p!==null)return;let v=this.scene.clock;u.value="1",c.value=String(bm(v.steps,this.speed,Ur(v))??pc[0])},_=()=>{if(p!==null)return;let v=l.options[2],E=h();v.textContent=`stage, ${E.width}\xD7${E.height}`;let A=this.scene.clock,P=mc(A.steps,Number(c.value),Number(u.value),this.speed,0,Ur(A)),k=gc(P.count,Number(c.value));f.textContent=k??`${P.count} frames, ${P.duration.toFixed(1)} s at ${this.speed}\xD7 speed`,d.disabled=k!==null};for(let v of[l,c,u])v.addEventListener("change",_);this.refreshExport=()=>{i.hidden||(b(),_())},d.addEventListener("click",()=>{let v=new AbortController;p=v,d.disabled=!0,y.hidden=!1,g.hidden=!1,g.value=0,s.hidden=!1,s.style.width="0%";let E=l.value,A=`${(this.scene.title??"tycho").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"tycho"}.mp4`,P="";this.exportVideo({size:E,fps:Number(c.value),loops:Number(u.value),signal:v.signal,onConfig:k=>P=`${k.width}\xD7${k.height} H.264 ${k.codec}`,onProgress:(k,w)=>{g.max=w,g.value=k,s.style.width=`${w>0?100*k/w:0}%`,f.textContent=`${P}, frame ${k} of ${w}`}}).then(k=>{let w=URL.createObjectURL(k),M=se("a");M.href=w,M.download=A,this.shadowRoot.appendChild(M),M.click(),M.remove(),window.setTimeout(()=>URL.revokeObjectURL(w),6e4),f.textContent=`saved ${A}, ${P}, ${(k.size/1e6).toFixed(2)} MB`}).catch(k=>{f.textContent=k instanceof DOMException&&k.name==="AbortError"?"canceled":`export failed: ${k.message}`}).finally(()=>{p=null,d.disabled=!1,y.hidden=!0,g.hidden=!0,s.hidden=!0})}),y.addEventListener("click",()=>p?.abort()),i.append(l,c,u,f,d,g,y,m),this.footer.append(i)}makeWidget(e,t){let i=this.scene,r=it(i,e.variable);if(r===void 0)return null;let s=l=>this.store.update(c=>Hi(i,c,e.variable,l,t)),a=l=>{let c=r.scope==="panel"?l.panel.variables:l.state.variables;return c!==void 0&&Object.hasOwn(c,e.variable)?c[e.variable]:r.default},o=()=>{let l=se("label","field");return l.appendChild(se("span","k",e.label)),l.addEventListener("pointerdown",Kn),l};if(e.kind==="tabs"&&r.kind==="choice"&&t!==void 0&&r.values.length>3){let l=r,c=se("select");l.values.forEach((u,f)=>{let d=se("option",void 0,l.labels?.[f]??u);d.value=u,c.appendChild(d)}),c.addEventListener("change",()=>s(c.value));let h=o();return h.appendChild(c),{el:h,sync:u=>{c.value=String(a(u))}}}if(e.kind==="tabs"&&r.kind==="choice"){let l=r,c=Nm(l.values.map((u,f)=>({id:u,label:l.labels?.[f]??u})),u=>s(u),e.label),h=se("span","field");return h.append(se("span","k",e.label),c.el),h.addEventListener("pointerdown",Kn),{el:h,sync:u=>c.set(String(a(u)))}}if(e.kind==="toggle"&&r.kind==="toggle"){let l=se("input");l.type="checkbox",l.addEventListener("change",()=>s(l.checked));let c=o();return c.prepend(l),{el:c,sync:h=>{l.checked=a(h)===!0}}}if(e.kind==="slider"&&r.kind==="selector"){let l=se("input");l.type="range",l.min="0",l.step="1";let c=se("output"),h=[];l.addEventListener("input",()=>{Gu(l,Number(l.value));let f=h[Number(l.value)];f!==void 0&&s(f)});let u=o();return u.append(l,c),{el:u,sync:f=>{h=co(f,this.geometry.sets,e),l.disabled=h.length===0,l.max=String(Math.max(0,h.length-1));let d=a(f);Gu(l,Math.max(0,Hs(h,d))),c.textContent=sn(d)}}}return null}templateChoice(){let e=this.scene,t=Object.entries(e.variables??{}).filter(([,o])=>o?.kind==="choice"&&o.scope==="panel");if(t.length===0)return null;let i=new Set(Object.values(e.views).map(o=>typeof o.frame=="string"?"":o.frame.var)),[r,s]=t.find(([o])=>i.has(o))??t[0],a=(e.controls??[]).find(o=>o.kind==="tabs"&&o.variable===r);return{id:r,def:s,label:a?.label??r}}templates(){let e=this.scene,t=Object.entries(e.views).map(([r,s])=>({kind:"view",view:r,label:s.label??r})),i=this.choice;return t.length>1||i===null?t:i.def.values.map((r,s)=>({kind:"value",variable:i.id,value:r,label:i.def.labels?.[s]??r}))}buildTopBar(){let e=this.scene;this.varsEl.replaceChildren(),this.sceneWidgets=[];for(let t of e.controls??[]){if(t.kind==="transport"||it(e,t.variable)?.scope==="panel")continue;let i=this.makeWidget(t,void 0);i&&(this.sceneWidgets.push(i),this.varsEl.appendChild(i.el))}this.buildAddGroup(),this.statsEl.replaceChildren(),this.captions=(e.readouts??[]).filter(t=>t.place==="caption").map(t=>Um(t.parts,"wide")),this.statsEl.append(...this.captions.map(t=>t.root))}buildAddGroup(){this.addEl.replaceChildren();let e=this.templates(),t=se("div","chips");t.appendChild(se("span","k","Add panel")),this.addChips=[];for(let r of e){let s=Om(r.label,"menu");s.body.setAttribute("role","button"),s.body.tabIndex=0,s.body.setAttribute("aria-roledescription","draggable"),s.body.title="Drag onto a panel: an edge splits it, the center replaces it. Click to add a panel.",s.body.addEventListener("pointerdown",o=>this.startDrag(o,r,s.body,s.root)),s.body.addEventListener("keydown",o=>{o.key!=="Enter"&&o.key!==" "||(o.preventDefault(),o.stopPropagation(),this.addPanel(r))});let a=s.button;a.addEventListener("click",()=>this.openMenu(a,this.chipEntries(r))),t.appendChild(s.root),this.addChips.push(s.root)}let i=se("button","btn");i.type="button",i.setAttribute("aria-haspopup","menu"),i.setAttribute("aria-expanded","false"),i.append(Zn("plus"),se("span",void 0,"Add panel"),Zn("chevronDown","chev")),i.hidden=!0,i.addEventListener("pointerdown",Kn),i.addEventListener("click",()=>this.openMenu(i,e.map(r=>({label:r.label,run:()=>this.addPanel(r)})))),this.addEl.append(t,i),this.addGroup=t,this.addButton=i,this.fitAddGroup()}fitAddGroup(){let e=this.addGroup,t=this.addButton;if(e===null||t===null||this.addChips.length<2)return;let i=this.shadowRoot?.activeElement??null;e.hidden=!1,t.hidden=!0;let r=this.addChips[0],a=this.addChips[this.addChips.length-1].offsetTop>r.offsetTop+r.offsetHeight/2;e.hidden=a,t.hidden=!a,a&&i!==null&&e.contains(i)&&t.focus()}chipEntries(e){let t=this.scene;return Lm(this.store.state,i=>this.panelName(i),Mc).map(i=>({label:i.label,disabled:i.disabled,group:i.group,run:()=>this.store.update(r=>Dm(t,r,i.placement,e,Mc,s=>this.isTall(s)))}))}addPanel(e){this.store.update(t=>Vu(this.scene,t,e,Mc,i=>this.isTall(i)))}isTall(e){let t=this.panelDom.get(e)?.host.getBoundingClientRect();return t!==void 0&&t.width<t.height}panelName(e){let t=this.panelDom.get(e);if(t===void 0)return e;let i=t.chipLabel.textContent??"";return t.title.hidden?i||e:`${t.title.textContent??e}, ${i}`}openMenu(e,t){let i=this.menu?.anchor===e;if(this.closeMenu(!1),i)return;let r=se("div","menu");r.setAttribute("role","menu");let s=[];for(let h of t){if(h.group&&s.length>0){let f=se("hr");f.setAttribute("role","separator"),r.appendChild(f)}let u=se("button",void 0,h.label);u.type="button",u.setAttribute("role","menuitem"),u.tabIndex=-1,u.disabled=h.disabled===!0,u.addEventListener("click",()=>{this.closeMenu(!0),h.run()}),r.appendChild(u),s.push(u)}let a=s.filter(h=>!h.disabled);r.addEventListener("pointerdown",Kn),r.addEventListener("keydown",h=>{let u=a.indexOf(this.shadowRoot.activeElement),f=a.length,d=g=>a[(g%f+f)%f]?.focus();if(h.key==="ArrowDown")d(u+1);else if(h.key==="ArrowUp")d(u-1);else if(h.key==="Home")d(0);else if(h.key==="End")d(f-1);else if(h.key==="Escape")this.closeMenu(!0);else if(h.key==="Tab")this.closeMenu(!1);else return;h.key!=="Tab"&&h.preventDefault(),h.stopPropagation()}),this.root.appendChild(r);let o=e.getBoundingClientRect(),l=o.bottom+4+r.offsetHeight<=window.innerHeight;r.style.left=`${Math.max(4,Math.min(o.left,window.innerWidth-r.offsetWidth-4))}px`,r.style.top=`${l?o.bottom+4:Math.max(4,o.top-r.offsetHeight-4)}px`,e.setAttribute("aria-expanded","true");let c=h=>{let u=h.composedPath();!u.includes(r)&&!u.includes(e)&&this.closeMenu(!1)};window.addEventListener("pointerdown",c,!0),this.menu={anchor:e,close:h=>{r.remove(),e.setAttribute("aria-expanded","false"),window.removeEventListener("pointerdown",c,!0),h&&e.focus()}},a[0]?.focus()}closeMenu(e){let t=this.menu;this.menu=null,t?.close(e)}syncWidgets(){let e=this.store,t=this.scene,i=e.state,r=this.firstPanel();if(r!==null){let o={scene:t,state:i,panel:i.panels[r]};for(let l of this.sceneWidgets)l.sync(o)}let s=Object.keys(t.views).length,a=this.choice;for(let[o,l]of this.panelDom){let c=i.panels[o];if(c===void 0)continue;let h={scene:t,state:i,panel:c};for(let p of l.widgets)p.sync(h);let u=t.views[c.view];l.title.textContent=u.label??c.view,l.title.hidden=s<2;let f=typeof u.frame=="string"?u.frame:String(this.panelValue(h,u.frame.var)),g=(Object.hasOwn(t.frames,f)?t.frames[f]:void 0)?.label??f,y=u.frame,m=typeof y=="string"?null:y.var;if(a!==null&&l.select!==null){let p=String(this.panelValue(h,a.id));l.select.value=p,zn(l.chipLabel,a.def.labels?.[a.def.values.indexOf(p)]??p),l.meta.textContent=g,l.meta.hidden=m===a.id||m!==null&&(t.controls??[]).some(b=>b.kind!=="transport"&&b.variable===m&&it(t,m)?.scope==="panel")}else zn(l.chipLabel,g),l.meta.hidden=!0;l.close.hidden=Object.keys(i.panels).length<2}this.transport?.channel?.set(i.clock.channel)}panelValue(e,t){let i=it(e.scene,t);if(i===void 0)return"";let r=i.scope==="panel"?e.panel.variables:e.state.variables;return r!==void 0&&Object.hasOwn(r,t)?r[t]:i.default}syncPanels(){let e=this.store.state;for(let t of[...this.panelDom.keys()])Object.hasOwn(e.panels,t)||this.removePanelDom(t);for(let t of Object.keys(e.panels)){let i=this.panelDom.get(t);i!==void 0&&i.view===e.panels[t].view||(i!==void 0&&this.removePanelDom(t),this.createPanelDom(t,e.panels[t]))}}createPanelDom(e,t){let i=this.scene,r=se("div","panel");r.dataset.id=e;let s=se("div","pbody"),a=(i.readouts??[]).filter(E=>E.place==="panel").map(E=>Um(E.parts,"stack")),o=se("div","preadout");o.append(...a.map(E=>E.root));let l=se("div","perror"),c=se("div","cbars"),h=se("div","drop"),u=se("span");h.appendChild(u),h.hidden=!0,s.append(o,l,c,h),s.addEventListener("dblclick",()=>this.fitPanel(e));let f=se("div","phead"),d=se("span","t"),g=this.choice,y=Om("",g===null?"none":"select");if(y.body.title="Drag to move the panel: onto an edge of another to place it there, onto its center to swap",g!==null&&y.select!==null){let E=y.select;E.setAttribute("aria-label",g.label),g.def.values.forEach((A,P)=>{let k=se("option",void 0,g.def.labels?.[P]??A);k.value=A,E.appendChild(k)}),E.addEventListener("change",()=>this.store.update(A=>Hi(i,A,g.id,E.value,e)))}let m=se("span","m"),p=se("span","pc mini"),b=[];for(let E of i.controls??[]){if(E.kind==="transport"||it(i,E.variable)?.scope!=="panel"||g!==null&&E.kind==="tabs"&&E.variable===g.id)continue;let A=this.makeWidget(E,e);A&&(b.push(A),p.appendChild(A.el))}let _=ws("house","Reset view","Reset view: fit to what this panel draws (F resets every panel)");_.addEventListener("click",()=>this.fitPanel(e));let v=ws("x","Close panel","Close panel");v.addEventListener("click",()=>this.store.update(E=>Im(E,e))),f.append(d,y.root,m,p,se("span","sp"),_,v),f.addEventListener("pointerdown",E=>this.startDrag(E,{kind:"panel",id:e},f,y.root)),r.append(s,f),this.panelsEl.appendChild(r),this.panelDom.set(e,{host:r,body:s,head:f,title:d,chip:y.root,chipLabel:y.label,select:y.select,meta:m,close:v,readouts:a,error:l,drop:h,dropLabel:u,bars:c,barDom:[],barsFor:null,widgets:b,view:t.view}),this.renderer?.bind(e,s)}removePanelDom(e){let t=this.panelDom.get(e);t&&(this.renderer?.bind(e,null),t.host.remove(),this.panelDom.delete(e))}layoutDom(){if(this.store===null)return;let{w:e,h:t}=this.stageSize,i=gs(this.store.state.layout,{x:0,y:0,w:e,h:t},bs);for(let[s,a]of i.panels){let o=this.panelDom.get(s);o&&Object.assign(o.host.style,{left:`${a.x}px`,top:`${a.y}px`,width:`${a.w}px`,height:`${a.h}px`})}this.gutters=i.gutters;let r=new Set;for(let s of i.gutters){r.add(s.path);let a=this.gutterDom.get(s.path);if(!a){a=se("div","gutter");let o=s.path;a.addEventListener("pointerdown",l=>this.startResize(l,o,a)),this.gutterDom.set(s.path,a),this.panelsEl.appendChild(a)}a.className=`gutter ${s.dir}`,Object.assign(a.style,{left:`${s.rect.x}px`,top:`${s.rect.y}px`,width:`${s.rect.w}px`,height:`${s.rect.h}px`})}for(let[s,a]of[...this.gutterDom])r.has(s)||(a.remove(),this.gutterDom.delete(s))}startResize(e,t,i){let r=this.gutters.find(o=>o.path===t);if(!r||e.button!==0)return;e.preventDefault(),i.classList.add("active"),i.setPointerCapture(e.pointerId);let s=o=>{let l=this.stage.getBoundingClientRect(),c=im(r,o.clientX-l.left,o.clientY-l.top,bs);this.store.update(h=>Ra(h,lc(h.layout,t,c)))},a=()=>{i.classList.remove("active"),i.removeEventListener("pointermove",s),i.removeEventListener("pointerup",a),i.removeEventListener("pointercancel",a)};i.addEventListener("pointermove",s),i.addEventListener("pointerup",a),i.addEventListener("pointercancel",a)}syncBars(e,t){let i=this.scene,r=this.renderer.colorbars(e);t.barDom.length!==r.length&&(t.barDom=r.map(()=>this.makeBar(e)),t.bars.replaceChildren(...t.barDom.map(o=>o.root)));let s=this.store.state.panels[e],a=s===void 0?void 0:i.views[s.view];r.forEach((o,l)=>{let c=t.barDom[l];zn(c.title,o.label),c.gradient!==o.gradient&&(c.gradient=o.gradient,c.grad.style.background=o.gradient);let h=Number.isInteger(o.lo)&&Number.isInteger(o.hi)?void 0:3;zn(c.hi,sn(o.hi,h)),zn(c.lo,sn(o.lo,h)),c.range=[o.lo,o.hi],c.mark.hidden=o.marker===null,o.marker!==null&&(c.mark.style.bottom=`${(100*o.marker).toFixed(2)}%`),c.band.hidden=o.band===null,o.band!==null&&(c.band.style.bottom=`${(100*o.band[0]).toFixed(2)}%`,c.band.style.height=`${(100*(o.band[1]-o.band[0])).toFixed(2)}%`),c.link=a===void 0?null:rf(i,a,o.label);let u=c.grad;if(u.classList.toggle("live",c.link!==null),c.link===null){for(let d of["role","tabindex","aria-orientation","aria-label","aria-valuemin","aria-valuemax","aria-valuenow","aria-valuetext","title"])u.removeAttribute(d);return}let f=this.panelValue({scene:i,state:this.store.state,panel:s},c.link.variable);u.setAttribute("role","slider"),u.setAttribute("tabindex","0"),u.setAttribute("aria-orientation","vertical"),u.setAttribute("aria-label",c.link.label),u.setAttribute("aria-valuemin",String(o.lo)),u.setAttribute("aria-valuemax",String(o.hi)),u.setAttribute("aria-valuenow",String(f)),u.setAttribute("aria-valuetext",sn(f)),u.title=`Drag or click to set ${c.link.label}`})}makeBar(e){let t=se("div","cbar"),i=se("div","cbar-t"),r=se("div","cbar-b"),s=se("div","cbar-g"),a=se("span","cbar-k"),o=se("i");s.append(a,o);let l=se("div","cbar-n"),c=se("span"),h=se("span");l.append(c,h),r.append(s,l),t.append(i,r);let u={root:t,title:i,grad:s,band:a,mark:o,hi:c,lo:h,gradient:"",range:[0,1],link:null};return s.addEventListener("pointerdown",f=>{if(u.link===null||f.button!==0)return;f.preventDefault(),f.stopPropagation(),s.focus(),s.setPointerCapture(f.pointerId);let d=y=>{let m=s.getBoundingClientRect();this.setFromBar(e,u,m.height>0?(m.bottom-y.clientY)/m.height:0)},g=()=>{s.removeEventListener("pointermove",d),s.removeEventListener("pointerup",g),s.removeEventListener("pointercancel",g)};d(f),s.addEventListener("pointermove",d),s.addEventListener("pointerup",g),s.addEventListener("pointercancel",g)}),s.addEventListener("dblclick",Kn),s.addEventListener("keydown",f=>{if(u.link===null)return;let d={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1,PageUp:10,PageDown:-10,Home:-1/0,End:1/0};f.key in d&&(f.preventDefault(),f.stopPropagation(),this.stepBar(e,u,d[f.key]))}),u}barStops(e,t){let i=this.store.state,r=i.panels[e];if(r===void 0)return[];let s={kind:"slider",variable:t.variable,label:t.label,domain:t.domain};return co({scene:this.scene,state:i,panel:r},this.geometry.sets,s)}setFromBar(e,t,i){if(t.link===null)return;let r=this.barStops(e,t.link),s=sf(r,t.range[0],t.range[1],i),a=t.link.variable;s>=0&&this.store.update(o=>Hi(this.scene,o,a,r[s]))}stepBar(e,t,i){if(t.link===null)return;let r=this.barStops(e,t.link),s=this.store.state;if(r.length===0||s.panels[e]===void 0)return;let a=this.panelValue({scene:this.scene,state:s,panel:s.panels[e]},t.link.variable),o=Math.min(r.length-1,Math.max(0,Hs(r,a)+i)),l=t.link.variable;this.store.update(c=>Hi(this.scene,c,l,r[o]))}startDrag(e,t,i,r){if(e.button!==0||this.store===null)return;e.preventDefault(),this.closeMenu(!1);let s=e.clientX,a=e.clientY,o=this.shadowRoot,l=null,c=null;i.setPointerCapture(e.pointerId);let h=()=>{for(let d of this.panelDom.values())d.drop.hidden=!0},u=d=>{if(!l){if(Math.hypot(d.clientX-s,d.clientY-a)<4)return;l=r.cloneNode(!0),l.classList.add("ghost"),this.root.appendChild(l),r.classList.add("source"),this.root.classList.add("dragging")}l.style.left=`${d.clientX}px`,l.style.top=`${d.clientY}px`,h(),c=null;let y=o.elementFromPoint(d.clientX,d.clientY)?.closest(".panel");if(!y)return;let m=y.dataset.id;if(t.kind==="panel"&&t.id===m)return;let p=this.panelDom.get(m);if(!p)return;let b=p.host.getBoundingClientRect(),_=Cm(d.clientX-b.left,d.clientY-b.top,b.width,b.height);c={id:m,zone:_},p.drop.hidden=!1,p.drop.style.inset=_==="left"?"0 50% 0 0":_==="right"?"0 0 0 50%":_==="top"?"0 0 50% 0":_==="bottom"?"50% 0 0 0":"0",zn(p.dropLabel,gw(t,_))},f=d=>{i.removeEventListener("pointermove",u),i.removeEventListener("pointerup",f),i.removeEventListener("pointercancel",f),h();let g=l!==null;if(l?.remove(),r.classList.remove("source"),this.root.classList.remove("dragging"),!g){t.kind!=="panel"&&d.type==="pointerup"&&this.addPanel(t);return}c&&this.dropOn(c.id,c.zone,t)};i.addEventListener("pointermove",u),i.addEventListener("pointerup",f),i.addEventListener("pointercancel",f)}dropOn(e,t,i){let r=this.scene;this.store.update(s=>Sc(r,s,e,t,i,Mc))}};function Ec(n="tycho-viewer"){typeof customElements<"u"&&!customElements.get(n)&&customElements.define(n,Pa)}function xw(n,e){return n.exportVideo(e)}Ec();return Jm(bw);})();
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
   * Copyright 2010-2025 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
