import type {StructureResolver} from 'sanity/structure';

/** Editor-facing navigation. Settings and Home are unique singleton documents. */
export const vbfaStructure:StructureResolver=(S)=>
  S.list().id('vbfa-content-root').title('VBFA · Quản trị nội dung').items([
    S.listItem().id('content-pages').title('01 · Nội dung website').child(
      S.list().id('page-settings').title('Nội dung website').items([
        S.listItem().singleton('homePage'),
        S.listItem().singleton('siteSettings'),
        S.documentTypeListItem('focusArea').title('Lĩnh vực trọng tâm'),
      ])
    ),
    S.divider(),
    S.listItem().id('editorial').title('02 · Tin tức & hoạt động').child(
      S.list().id('editorial-list').title('Tin tức & hoạt động').items([
        S.documentTypeListItem('article').title('Bài viết & tin ngành'),
        S.documentTypeListItem('event').title('Hoạt động & sự kiện'),
      ])
    ),
    S.listItem().id('resources').title('03 · Thư viện').child(
      S.list().id('resources-list').title('Tài liệu').items([
        S.documentTypeListItem('resource').title('Tài liệu & báo cáo'),
      ])
    ),
    S.listItem().id('network').title('04 · Kết nối').child(
      S.list().id('network-list').title('Hợp tác & đối tác').items([
        S.documentTypeListItem('partner').title('Đối tác đã xác minh'),
      ])
    ),
  ]);
