(function(){
  /* ---------- Price chart ---------- */
  // [label, price] approximate
  const data=__RD_DATA__;
  const W=920,H=300;
  const padL=48,padR=16,padT=18,padB=34;
  const min=__RD_MIN__,max=__RD_MAX__;
  const cur="__RD_CURSYM__",HL=__RD_HL__;  // สัญลักษณ์สกุลเงิน ($/฿) + ดัชนีจุดที่ไฮไลต์ (ต่อหุ้น)
  const xs=i=>padL+(W-padL-padR)*(i/(data.length-1));
  const ys=v=>padT+(H-padT-padB)*(1-(v-min)/(max-min));
  let path="",area="";
  data.forEach((d,i)=>{const x=xs(i),y=ys(d[1]);path+=(i?"L":"M")+x.toFixed(1)+" "+y.toFixed(1)+" ";});
  area=path+`L${xs(data.length-1).toFixed(1)} ${ys(min).toFixed(1)} L${padL} ${ys(min).toFixed(1)} Z`;
  let svg=`<defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="__RD_ACCENT__" stop-opacity=".22"/><stop offset="1" stop-color="__RD_ACCENT__" stop-opacity="0"/></linearGradient></defs>`;
  // gridlines
  [__RD_GRID__].forEach(v=>{const y=ys(v);svg+=`<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="#eef1f5" stroke-width="1"/><text x="${padL-8}" y="${y+4}" text-anchor="end" font-size="11" fill="#6b7383" font-family="IBM Plex Mono">${cur}${__RD_GRIDVAL__}</text>`;});
  // fair value line
  const fy=ys(__RD_FAIRLINE__);svg+=`<line x1="${padL}" y1="${fy}" x2="${W-padR}" y2="${fy}" stroke="#1e8e3e" stroke-width="1.5" stroke-dasharray="6 5"/>`;
  // area + line
  svg+=`<path d="${area}" fill="url(#ag)"/><path d="${path}" fill="none" stroke="__RD_ACCENT__" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`;
  // points + x labels (ไฮไลต์จุดตาม HL ; จุดสุดท้ายของกราฟ = accent, จุดไฮไลต์อื่น = แดง — กฎสากลทุกรายงาน)
  data.forEach((d,i)=>{const x=xs(i),y=ys(d[1]);const hi=HL.indexOf(i)>=0;
    svg+=`<circle cx="${x}" cy="${y}" r="${hi?5:3.2}" fill="${hi?'#ea4335':'__RD_ACCENT__'}" stroke="#fff" stroke-width="2"/>`;
    svg+=`<text x="${x}" y="${H-12}" text-anchor="middle" font-size="11" fill="#6b7383">${d[0]}</text>`;
    if(hi)svg+=`<text x="${x}" y="${y-12}" text-anchor="middle" font-size="11" font-weight="700" fill="${i===data.length-1?'__RD_ACCENTD__':'#c5221f'}" font-family="IBM Plex Mono">${cur}${__RD_DATAVAL__}</text>`;
  });
  document.getElementById("priceChart").innerHTML=svg;

  /* ---------- Gauge marker positions ---------- */
  const gmin=__RD_GMIN__,gmax=__RD_GMAX__;
  const gpos=v=>Math.max(2,Math.min(98,(v-gmin)/(gmax-gmin)*100));
  document.getElementById("mCur").style.left=gpos(__RD_CUR__)+"%";
  document.getElementById("mFair").style.left=gpos(__RD_FAIR__)+"%";
  // nudge fair label up to avoid overlap
  document.querySelector("#mFair .lab").style.top="__RD_FAIRTOP__";

  /* ---------- MOS calculator ---------- */
  const FV=__RD_FV__;
  const out=document.getElementById("mosOut");
  const inp=document.getElementById("pxIn");
  function calc(){
    const p=parseFloat(inp.value);
    if(isNaN(p)||p<=0){out.innerHTML="<span style='color:#6b7383'>กรอกราคา…</span>";return;}
    const mos=(FV-p)/FV*100;
    let c,msg;
    if(mos<10){c="#c5221f";msg=mos<0?"แพงกว่ามูลค่า — ไม่ปลอดภัย":"ส่วนเผื่อบาง — ยังไม่น่าซื้อ";}
    else if(mos<20){c="#b06000";msg="พอใช้ — ทยอยสะสมได้";}
    else if(mos<30){c="#137333";msg="น่าซื้อ — โซน Value Investor";}
    else{c="#137333";msg="ถูกมาก — เช็คว่าไม่ใช่ value trap";}
    out.innerHTML=`MOS = <span class="mono" style="color:${c};font-size:18px">${mos>0?'+':''}${mos.toFixed(1)}%</span> &nbsp;<span style="color:${c}">${msg}</span>`;
  }
  inp.addEventListener("input",calc);
  calc();
})();
