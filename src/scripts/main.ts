import { initArticle } from './article';
import { initChrome } from './chrome';
import { initForms } from './forms';
import { initHero } from './hero';
import { initHome } from './home';
import { initNews } from './news';
import { initOverlays } from './overlays';
import { initPopup } from './popup';
import { initReveal } from './reveal';
import { initSearch } from './search';

/** One entry point for every page; blocks run only when the page has the matching elements. */
initReveal();
initChrome();
initOverlays();
initSearch();
initForms();
initHero();
initPopup();

const page = document.body.dataset.page;
if (page === 'home') initHome();
if (page === 'news') initNews();
if (page === 'article') initArticle();
