import { FullFrame, Sequence, useFrame, useComposition, spring, interpolate } from '@creativesos/cut';

const cyan = '#68f4df';
const ink = '#07101a';
const clamp = (f:number, a:number, b:number, x:number, y:number) => interpolate(f,[a,b],[x,y]);
function Arrival({children, delay=0, size=112, color='#f4f8fc'}:{children:any,delay?:number,size?:number,color?:string}) {
  const f=useFrame(); const {fps}=useComposition();
  const p=spring({frame:f-delay,fps,damping:23,stiffness:150,clampOvershoot:true});
  return <div style={{fontSize:size,fontWeight:750,letterSpacing:-5,lineHeight:1.04,color,opacity:clamp(f,delay,delay+8,0,1),transform:`translateY(${(1-p)*100}px)`}}>{children}</div>;
}
function Opening(){const f=useFrame();return <FullFrame style={{padding:'610px 98px 0',opacity:clamp(f,0,9,0,1),clipPath:`inset(0 0 0 ${clamp(f,50,66,0,100)}%)`,transform:`translateY(${-clamp(f,48,68,0,55)}px)`}}>
  <div style={{color:cyan,fontSize:27,letterSpacing:6,marginBottom:40}}>THE CREATIVE WORKFLOW</div>
  <Arrival>Make every</Arrival><Arrival delay={5} color={cyan}>idea move.</Arrival>
  <div style={{fontSize:35,lineHeight:1.5,color:'#b1c2d0',marginTop:42,opacity:clamp(f,18,32,0,1)}}>From the first frame<br/>to the next connection.</div>
</FullFrame>}
function Workflow(){const f=useFrame();const {fps}=useComposition();return <FullFrame style={{padding:'430px 98px 0',clipPath:f<65?`inset(0 ${100-clamp(f,0,16,0,100)}% 0 0)`:`inset(0 0 0 ${clamp(f,65,80,0,100)}%)`}}>
  <div style={{fontSize:28,letterSpacing:5,color:'#9bb4c7',marginBottom:46}}>ONE CONNECTED SYSTEM</div>
  {['Create','Publish','Connect'].map((word,i)=>{const p=spring({frame:f-i*9,fps,damping:24,stiffness:165,clampOvershoot:true});return <div key={word} style={{display:'flex',alignItems:'center',height:184,marginBottom:24,padding:'0 42px',borderRadius:28,border:'1px solid #2a4557',background:i===1?'#13302e':'#101f2b',opacity:clamp(f,i*9,i*9+8,0,1),transform:`translateX(${(1-p)*160}px)`}}>
    <div style={{width:86,height:86,borderRadius:22,display:'grid',placeItems:'center',fontSize:32,color:cyan,border:'1px solid #345753',marginRight:36}}>0{i+1}</div>
    <span style={{fontSize:68,fontWeight:650,letterSpacing:-2}}>{word}</span>
    <svg width="52" height="52" viewBox="0 0 52 52" style={{marginLeft:'auto'}}><path d="M10 26h30M29 14l12 12-12 12" fill="none" stroke={cyan} strokeWidth="3"/></svg>
  </div>})}
</FullFrame>}
function Closing(){const f=useFrame();const {fps}=useComposition();const p=spring({frame:f,fps,damping:22,stiffness:145,clampOvershoot:true});return <FullFrame style={{display:'flex',alignItems:'center',flexDirection:'column',paddingTop:565,clipPath:`inset(0 ${100-clamp(f,0,15,0,100)}% 0 0)`,transform:`translateY(${(1-p)*70}px)`}}>
  <svg width="220" height="220" viewBox="0 0 220 220" style={{marginBottom:60,transform:`rotate(${clamp(f,0,45,-22,0)}deg)`}}><circle cx="110" cy="110" r="91" stroke={cyan} strokeWidth="2" fill="#11332f"/><path d="M62 79h53M62 110h91M100 141h53" stroke={cyan} strokeWidth="14" strokeLinecap="round"/></svg>
  <div style={{fontSize:112,fontWeight:750,letterSpacing:-6}}>CreativesOS</div>
  <div style={{fontSize:41,color:'#b9d0dc',marginTop:29}}>Built for distribution.</div>
  <div style={{marginTop:76,fontSize:22,letterSpacing:4,color:cyan,border:'1px solid #325c54',borderRadius:40,padding:'22px 34px',opacity:clamp(f,20,34,0,1)}}>CREATIVE WORK. CONNECTED.</div>
</FullFrame>}
export default function MotionWorkload(){const f=useFrame();return <FullFrame style={{background:ink,color:'#f4f8fc',fontFamily:'DejaVu Sans, sans-serif',overflow:'hidden'}}>
  <svg width="1080" height="1920" style={{position:'absolute',inset:0}}>
    <defs><radialGradient id="light"><stop offset="0" stopColor="#164e58" stopOpacity=".58"/><stop offset="1" stopColor={ink} stopOpacity="0"/></radialGradient><pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="#709eaf" opacity=".2"/></pattern></defs>
    <rect width="1080" height="1920" fill="url(#grid)"/>
    <ellipse cx={820+Math.sin(f/45)*130} cy={550+f*2} rx="690" ry="730" fill="url(#light)"/>
    {[0,1,2].map(i=><circle key={i} cx="980" cy="1430" r={190+i*70+f*.13} fill="none" stroke="#28424b" strokeWidth="1"/>)}
  </svg>
  <div style={{position:'absolute',left:98,top:124,fontSize:29,fontWeight:650,letterSpacing:-.6}}>CreativesOS<span style={{color:cyan}}> / </span>CutStudio</div>
  <Sequence at={0} duration={68}><Opening/></Sequence>
  <Sequence at={50} duration={80}><Workflow/></Sequence>
  <Sequence at={115} duration={65}><Closing/></Sequence>
  <div style={{position:'absolute',bottom:158,left:98,right:98,height:2,background:'#28414c'}}><div style={{width:`${(f/179)*100}%`,height:2,background:cyan}}/></div>
  <div style={{position:'absolute',bottom:105,left:98,fontSize:20,color:'#839caa',letterSpacing:3}}>NATIVE MOTION STUDY</div>
  <div style={{position:'absolute',bottom:105,right:98,fontSize:20,color:'#839caa'}}>0{f<50?1:f<115?2:3} / 03</div>
</FullFrame>}
