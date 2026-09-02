import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { renderIsolated } from './host.mjs';

export async function qualifyTextLayout({ image, directory }) {
  const font = await readFile(new URL('../../shared/assets/cut-fonts/NotoSans-Variable.ttf', import.meta.url));
  const code = String.raw`import {useLayoutEffect,useState} from 'react';
import {FullFrame,useFrame,holdFrame,releaseFrame,failRender,measureText,fitText} from '@creativesos/cut';
import fontSource from './brand.ttf';
let fontReady;
function loadFont(){return fontReady??=(async()=>{const face=new FontFace('Cut Typography', 'url('+JSON.stringify(fontSource)+')',{weight:'100 900'});await face.load();document.fonts.add(face);})();}
const placements=[[16,40],[336,40],[16,200],[336,200]];
export default function Scene(){const frame=useFrame();const [result,setResult]=useState(null);const [verified,setVerified]=useState(-1);
useLayoutEffect(()=>{const hold=holdFrame();let active=true;(async()=>{await loadFont();if(!active)return;
let refused=false;try{measureText({text:'Missing',fontFamily:'Unregistered Private Font',fontSize:32});}catch{refused=true;}if(!refused)throw Error('Missing private font was silently accepted');
const before=document.body.childElementCount;
const common={fontFamily:'Cut Typography',fontWeight:650,lineHeight:1.2};
const cases=[
{text:frame?'One creative system':'Create',value:null},
{text:'From a creative idea\nto a connected audience',value:null},
{text:'Design 123',value:null},
{text:'Crème brûlée <b>literal</b>',value:null}];
cases[0].value=fitText({...common,text:cases[0].text,withinWidth:270,withinHeight:116,maxFontSize:72});
cases[1].value=fitText({...common,text:cases[1].text,withinWidth:270,withinHeight:116,maxLines:3,minFontSize:10,maxFontSize:48});
cases[2].value=fitText({...common,text:cases[2].text,direction:'rtl',letterSpacing:1,withinWidth:270,withinHeight:116,maxFontSize:64});
cases[3].value=measureText({...common,text:cases[3].text,fontSize:24,width:270});
if(cases.slice(0,3).some(c=>!c.value.fits)||cases[1].value.lines>3)throw Error('A normal title failed fitting');
const impossible=fitText({...common,text:'TOO WIDE',withinWidth:1,minFontSize:48,maxFontSize:48});
const empty=fitText({...common,text:'',withinWidth:270,maxFontSize:92});
const tiny=measureText({...common,text:'M',fontSize:1.1,lineHeight:.5});
if(impossible.fits||impossible.fontSize!==48||!empty.fits||empty.width!==0||empty.lines!==0||tiny.lines!==1||document.body.childElementCount!==before)throw Error('Overflow, empty text, rounding or cleanup contract failed');
setResult({frame,cases,hold});})().catch(()=>failRender());return()=>{active=false;releaseFrame(hold);};},[frame]);
useLayoutEffect(()=>{if(!result||result.frame!==frame)return;for(let i=0;i<result.cases.length;i++){const node=document.getElementById('text-'+i);const range=document.createRange();range.selectNodeContents(node);let width=0;for(const rect of range.getClientRects())width=Math.max(width,rect.width);const height=node.getBoundingClientRect().height;const expected=result.cases[i].value;if(Math.abs(width-expected.width)>.02||Math.abs(height-expected.height)>.02||node.children.length)throw Error('Returned style does not reproduce actual text layout');}setVerified(frame);releaseFrame(result.hold);},[result,frame]);
return <FullFrame style={{background:'#102030'}}><div style={{position:'absolute',left:2,top:2,width:8,height:8,background:verified===frame?'#00ff00':'#ff0000'}}/>{result?.cases.map((item,i)=><div key={i} style={{position:'absolute',left:placements[i][0],top:placements[i][1],width:286,height:136,padding:8,background:'white',boxSizing:'border-box'}}><div id={'text-'+i} style={{...item.value.style,color:'black'}}>{item.text}</div></div>)}<div style={{position:'absolute',left:24,top:400,color:'white',fontSize:18}}>Private font · wrapping · explicit overflow · literal text</div></FullFrame>}`;
  const source = Buffer.from(zipSync({ 'package.json': strToU8('{"dependencies":{"react":"18.3.1"}}'), 'main.tsx': strToU8(code), 'brand.ttf': font }, { mtime: new Date('2020-01-01T00:00:00Z') }));
  const base = { version:1,mode:'still',format:'png',width:640,height:480,fps:2,durationInFrames:2,entrypoint:'main.tsx',input:{} };
  const records = []; const images = [];
  for (const frame of [0,1]) {
    const result = await renderIsolated({ request:{...base,frame},source,image });
    images.push(result.artifact);
    await writeFile(`${directory}text-layout-${frame}.png`, result.artifact);
    const pixels = execFileSync('ffmpeg',['-v','error','-nostdin','-i','pipe:0','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{input:result.artifact,maxBuffer:1_000_000,timeout:10_000,windowsHide:true});
    assert.equal(pixels.length,640*480*3);
    assert.deepEqual([...pixels.subarray((4*640+4)*3,(4*640+4)*3+3)],[0,255,0],'Actual browser metrics and font/overflow checks must have completed.');
    let ink=0;let overflow=0;
    for(let y=0;y<380;y++)for(let x=0;x<640;x++){
      const offset=(y*640+x)*3;
      if(pixels[offset]<24&&pixels[offset+1]<24&&pixels[offset+2]<24){ink++;if(![[16,40],[336,40],[16,200],[336,200]].some(([left,top])=>x>=left&&x<left+286&&y>=top&&y<top+136))overflow++;}
    }
    assert.ok(ink>1200,'The private-font text must really appear in the artifact.');
    assert.equal(overflow,0,'Visible text must stay inside the unclipped fixture boxes.');
    records.push({test:`private-font-text-layout-${frame}`,...result.receipt,visibleInkPixels:ink,overflowPixels:overflow});
  }
  assert.notDeepEqual(images[0],images[1],'A changed title must produce newly sized pixels.');
  const replay=await renderIsolated({request:base,source,image});
  assert.deepEqual(replay.artifact,images[0],'Private-font fitting must replay exact still pixels.');
  const video=await renderIsolated({request:{...base,mode:'video',format:'mp4',videoEncoding:{losslessRgb:true}},source,image});
  await writeFile(`${directory}text-layout.mp4`,video.artifact);
  const decoded=execFileSync('ffmpeg',['-v','error','-nostdin','-i','pipe:0','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{input:video.artifact,maxBuffer:2_000_000,timeout:10_000,windowsHide:true});
  const expected=Buffer.concat(images.map(bytes=>execFileSync('ffmpeg',['-v','error','-nostdin','-i','pipe:0','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{input:bytes,maxBuffer:1_000_000,timeout:10_000,windowsHide:true})));
  assert.deepEqual(decoded,expected,'Sequential fitted text must match independent stills at every frame.');
  records.push({test:'private-font-text-layout-video',...video.receipt,exactRgbSamples:decoded.length});
  console.log('PASS actual private-font text measurement/fitting, matching styles, wrapping, overflow, literal text, cleanup and exact dynamic replay');
  return records;
}
