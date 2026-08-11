/**
 * 웹 export 후 index.html 의 <head> 를 보강한다.
 *
 * web.output 이 "single"(SPA) 이라 expo-router 의 +html.tsx 가 적용되지 않는다
 * (그건 static 렌더링 전용). 그렇다고 static 으로 바꾸면 프리렌더 단계에서
 * Supabase 세션 복원이 Node 의 window 를 건드려 export 가 실패한다.
 * 그래서 생성된 index.html 에 직접 주입한다.
 *
 * 아이폰은 스토어 없이 설치할 방법이 없어 웹을 '홈 화면에 추가'해서 쓴다.
 * apple-mobile-web-app-capable 이 없으면 Safari 주소창이 남아 앱처럼 보이지 않는다.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const FILE = 'dist/index.html';
if (!existsSync(FILE)) {
  console.error(`${FILE} 이 없습니다. 먼저 npx expo export -p web 을 실행하세요.`);
  process.exit(1);
}

const HEAD = `
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
    <meta name="description" content="축구팀 출석 투표 · 회비 관리" />
    <meta name="theme-color" content="#12263F" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="FC Crossbar" />
    <meta name="mobile-web-app-capable" content="yes" />
    <style>
      html, body, #root { height: 100%; }
      body { margin: 0; background-color: #12263F; overscroll-behavior-y: none; -webkit-tap-highlight-color: transparent; }
    </style>
`;

let html = readFileSync(FILE, 'utf8');

if (html.includes('apple-mobile-web-app-capable')) {
  console.log('이미 주입되어 있습니다.');
  process.exit(0);
}

// expo 가 넣은 기본 viewport 는 우리 것으로 대체한다
html = html.replace(/<meta name="viewport"[^>]*\/?>/i, '');
html = html.replace('</head>', `${HEAD}  </head>`);

writeFileSync(FILE, html);
console.log('index.html 에 PWA 메타 태그를 주입했습니다.');
