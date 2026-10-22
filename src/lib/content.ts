import {createClient} from '@sanity/client';
export type Article={_id:string,title:string,slug?:string,excerpt?:string,category?:string,publishedAt?:string,coverUrl?:string,body?:unknown[],seoTitle?:string,seoDescription?:string};
export type Focus={_id:string,title:string,description?:string,number?:number,icon?:string};
export type Resource={_id:string,title:string,category?:string,description?:string,url?:string};
export type Event={_id:string,title:string,summary?:string,startsAt?:string,coverUrl?:string};
export type SiteSettings={organizationName?:string,organizationEnglish?:string,email?:string,phone?:string,address?:string,logoUrl?:string,seoTitle?:string,seoDescription?:string};
export type HomePage={eyebrow?:string,headline?:string,subheadline?:string,aboutTitle?:string,aboutDescription?:string,primaryCta?:string,heroImageUrl?:string,heroImageAlt?:string,focusTitle?:string,focusDescription?:string,newsTitle?:string,newsDescription?:string,membershipTitle?:string,membershipDescription?:string,resourcesTitle?:string,resourcesDescription?:string,contactTitle?:string,contactDescription?:string,seoTitle?:string,seoDescription?:string};
export type Content={settings:SiteSettings,home:HomePage,focus:Focus[],articles:Article[],resources:Resource[],events:Event[],connected:boolean};
const id=import.meta.env.PUBLIC_SANITY_PROJECT_ID?.trim();
const dataset=import.meta.env.PUBLIC_SANITY_DATASET||'production';
const version=import.meta.env.PUBLIC_SANITY_API_VERSION||'2026-03-01';
const client=id?createClient({projectId:id,dataset,apiVersion:version,useCdn:true,perspective:'published'}):null;
const fallback:Content={
 settings:{organizationName:'Hiệp hội Nhiên liệu Sinh học Việt Nam',organizationEnglish:'Vietnam Biofuels Association'},
 home:{eyebrow:'VIETNAM BIOFUELS ASSOCIATION',headline:'Kết nối nguồn lực. Kiến tạo tương lai năng lượng xanh.',subheadline:'Không gian kết nối thông tin, tri thức và hợp tác trong lĩnh vực nhiên liệu sinh học tại Việt Nam.',aboutTitle:'Cùng hướng tới một hệ sinh thái nhiên liệu sinh học bền vững.',aboutDescription:'Khám phá các chuyên đề chính sách, thị trường, công nghệ và hợp tác trong lĩnh vực nhiên liệu sinh học.',primaryCta:'Kết nối cùng VBFA'},
 focus:[
  {_id:'f1',number:1,title:'Chính sách & pháp lý',description:'Thông tin và tài liệu tham khảo liên quan đến khung chính sách và phát triển ngành.'},
  {_id:'f2',number:2,title:'Thị trường & đầu tư',description:'Theo dõi các chủ đề về thị trường, chuỗi cung ứng và cơ hội hợp tác.'},
  {_id:'f3',number:3,title:'Công nghệ & đổi mới',description:'Cập nhật hướng tiếp cận và giải pháp công nghệ nhiên liệu sinh học.'},
  {_id:'f4',number:4,title:'Phát triển bền vững',description:'Thúc đẩy thảo luận về chuyển dịch năng lượng và mục tiêu môi trường.'},
  {_id:'f5',number:5,title:'Đào tạo & tri thức',description:'Hệ thống hóa nguồn tri thức và chia sẻ nghiên cứu chuyên ngành.'},
  {_id:'f6',number:6,title:'Hợp tác quốc tế',description:'Mở rộng các chủ đề kết nối và trao đổi kinh nghiệm khu vực.'},
 ],
 articles:[],resources:[],events:[],connected:false
};
export async function getContent():Promise<Content>{
 if(!client)return fallback;
 try{
 const [settings,home,focus,articles,resources,events]=await Promise.all([
  client.fetch<SiteSettings|null>(`*[_type=="siteSettings" && _id=="siteSettings"][0]{organizationName,organizationEnglish,email,phone,address,seoTitle,seoDescription,"logoUrl":logo.asset->url}`),
  client.fetch<HomePage|null>(`*[_type=="homePage" && _id=="homePage"][0]{eyebrow,headline,subheadline,aboutTitle,aboutDescription,primaryCta,focusTitle,focusDescription,newsTitle,newsDescription,membershipTitle,membershipDescription,resourcesTitle,resourcesDescription,contactTitle,contactDescription,seoTitle,seoDescription,"heroImageUrl":heroImage.asset->url,"heroImageAlt":heroImage.alt}`),
  client.fetch<Focus[]>(`*[_type=="focusArea"]|order(number asc)[0...12]{_id,title,description,number,icon}`),
  client.fetch<Article[]>(`*[_type=="article" && defined(publishedAt) && publishedAt <= now()]|order(publishedAt desc)[0...12]{_id,title,"slug":slug.current,excerpt,category,publishedAt,"coverUrl":cover.asset->url,seoTitle,seoDescription,body}`),
  client.fetch<Resource[]>(`*[_type=="resource"]|order(_createdAt desc)[0...16]{_id,title,category,description,"url":coalesce(file.asset->url,externalUrl)}`),
  client.fetch<Event[]>(`*[_type=="event"]|order(startsAt desc)[0...8]{_id,title,summary,startsAt,"coverUrl":cover.asset->url}`)
 ]);
 return {settings:{...fallback.settings,...settings},home:{...fallback.home,...home},focus:focus.length?focus:fallback.focus,articles,resources,events,connected:true};
 }catch(error){console.warn('[VBFA] Sanity public content request failed; using non-factual fallback.',error);return fallback;}
}
export async function getArticle(slug:string){
 if(!client||!slug)return null;
 try{return await client.fetch<Article|null>(`*[_type=="article" && slug.current==$slug && defined(publishedAt) && publishedAt <= now()][0]{_id,title,"slug":slug.current,excerpt,category,publishedAt,"coverUrl":cover.asset->url,seoTitle,seoDescription,body}`,{slug});}
 catch{return null;}
}
