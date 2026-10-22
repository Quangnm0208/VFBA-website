import type { StructureResolver } from 'sanity/structure';

/** Documents that exist exactly once. The document id equals the type name (the website queries by type). */
export const SINGLETONS = ['siteSettings', 'homePage', 'newsPage'];

const single = (S: Parameters<StructureResolver>[0], type: string, title: string) =>
  S.listItem().id(type).title(title).child(S.document().schemaType(type).documentId(type).title(title));

export const structure: StructureResolver = (S) =>
  S.list()
    .id('root')
    .title('VBFA · Quản trị nội dung')
    .items([
      S.listItem()
        .id('website')
        .title('01 · Nội dung website')
        .child(
          S.list()
            .id('website-list')
            .title('Nội dung website')
            .items([single(S, 'homePage', 'Trang chủ'), single(S, 'newsPage', 'Trang Tin tức'), single(S, 'siteSettings', 'Thông tin chung · Biểu mẫu · SEO mặc định')]),
        ),
      S.divider(),
      S.documentTypeListItem('article').title('02 · Tin tức & góc nhìn'),
      S.documentTypeListItem('page').title('03 · Trang tĩnh (chính sách, điều khoản…)'),
      S.divider(),
      S.documentTypeListItem('popup').title('04 · Pop-up & chiến dịch'),
    ]);
