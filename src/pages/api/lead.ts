import type {APIRoute} from 'astro';
export const prerender=false;
type Input={kind?:unknown,name?:unknown,email?:unknown,company?:unknown,phone?:unknown,message?:unknown,consent?:unknown,turnstileToken?:unknown,source_page?:unknown,website?:unknown};
const reply=(code:number,message:string)=>new Response(JSON.stringify({message}),{status:code,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const safe=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
export const POST:APIRoute=async ({request,url})=>{
 const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return reply(403,'Nguồn yêu cầu không hợp lệ.');
 const length=Number(request.headers.get('content-length')||0);if(length>16000)return reply(413,'Nội dung gửi quá lớn.');
 let input:Input;try{input=await request.json()}catch{return reply(400,'Dữ liệu không hợp lệ.')}
 if(safe(input.website,100))return reply(200,'Đã ghi nhận yêu cầu.'); // honeypot
 const kind=safe(input.kind,20)||'contact';
 const name=safe(input.name,160), email=safe(input.email,254).toLowerCase(),company=safe(input.company,180),phone=safe(input.phone,50),message=safe(input.message,2000);
 if(!['contact','newsletter','membership'].includes(kind))return reply(400,'Loại yêu cầu không hợp lệ.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply(400,'Email không hợp lệ.');
 if(kind!=='newsletter'&&!name)return reply(400,'Vui lòng nhập họ tên.');
 if(input.consent!=='on'&&input.consent!==true)return reply(400,'Vui lòng đồng ý điều khoản xử lý dữ liệu.');
 const supabase=import.meta.env.SUPABASE_URL as string|undefined,key=import.meta.env.SUPABASE_SERVICE_ROLE_KEY as string|undefined,secret=import.meta.env.TURNSTILE_SECRET_KEY as string|undefined;
 if(!supabase||!key||!secret)return reply(503,'Biểu mẫu chưa được kích hoạt. Vui lòng liên hệ VBFA qua kênh chính thức.');
 const token=safe(input.turnstileToken,2048);
 if(!token)return reply(400,'Vui lòng hoàn tất xác minh chống spam.');
 const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'';
 let verification:Response;
 try{verification=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret,response:token,remoteip:ip}),signal:AbortSignal.timeout(6000)});}
 catch{return reply(503,'Chưa thể xác minh yêu cầu. Vui lòng thử lại.')}
 const checked=await verification.json().catch(()=>({success:false}));
 if(!checked.success)return reply(400,'Xác minh chống spam không thành công.');
 const safeURL=new URL(supabase);if(safeURL.protocol!=='https:')return reply(503,'Cấu hình dịch vụ chưa hợp lệ.');
 const record={kind,name:name||null,email,company:company||null,phone:phone||null,message:message||null,consent:true,source_page:safe(input.source_page,100)||'/',consent_text_version:'v1'};
 try{
  const response=await fetch(safeURL.origin+'/rest/v1/website_leads',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(record),signal:AbortSignal.timeout(8000)});
  if(!response.ok){console.error('[VBFA] Lead storage request failed',response.status);return reply(503,'Chưa thể tiếp nhận lúc này. Vui lòng thử lại sau.')}
  return reply(200,'Yêu cầu của bạn đã được tiếp nhận.');
 }catch{return reply(503,'Dịch vụ tạm thời gián đoạn. Vui lòng thử lại sau.')}
};
