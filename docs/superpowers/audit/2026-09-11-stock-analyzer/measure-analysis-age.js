const fs=require('fs'),path=require('path');
const TH={'ม.ค.':1,'ก.พ.':2,'มี.ค.':3,'เม.ย.':4,'พ.ค.':5,'มิ.ย.':6,'ก.ค.':7,'ส.ค.':8,'ก.ย.':9,'ต.ค.':10,'พ.ย.':11,'ธ.ค.':12,
'มกราคม':1,'กุมภาพันธ์':2,'มีนาคม':3,'เมษายน':4,'พฤษภาคม':5,'มิถุนายน':6,'กรกฎาคม':7,'สิงหาคม':8,'กันยายน':9,'ตุลาคม':10,'พฤศจิกายน':11,'ธันวาคม':12};
const today=new Date('2026-09-11');
const buckets={'≤7d':0,'8–30d':0,'31–60d':0,'61–90d':0,'91–120d':0,'>120d':0,'unparsed':0};
let be=0,ce=0; const rows=[];
for(const f of fs.readdirSync('reports').filter(x=>x.endsWith('.html'))){
  const h=fs.readFileSync(path.join('reports',f),'utf8');
  const fi=h.lastIndexOf('<footer');
  const foot=fi>=0?h.slice(fi):'';
  const m=foot.match(/ข้อมูล\s*ณ\s*(?:วันที่\s*)?(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})/);
  if(!m){buckets.unparsed++;continue;}
  let y=+m[3]; const mo=TH[m[2]]; if(!mo){buckets.unparsed++;continue;}
  if(y>2400){y-=543;be++;}else ce++;
  const d=new Date(Date.UTC(y,mo-1,+m[1]));
  const age=Math.round((today-d)/86400000);
  rows.push([f.replace('.html',''),age]);
  if(age<=7)buckets['≤7d']++;else if(age<=30)buckets['8–30d']++;else if(age<=60)buckets['31–60d']++;else if(age<=90)buckets['61–90d']++;else if(age<=120)buckets['91–120d']++;else buckets['>120d']++;
}
console.log('analysis-date age buckets:',JSON.stringify(buckets));
console.log('footer calendar: พ.ศ.='+be+' ค.ศ.='+ce);
rows.sort((a,b)=>b[1]-a[1]);
console.log('oldest 10:',rows.slice(0,10).map(r=>r[0]+':'+r[1]+'d').join(' '));
const med=rows.map(r=>r[1]).sort((a,b)=>a-b)[Math.floor(rows.length/2)];
console.log('median age days:',med);
