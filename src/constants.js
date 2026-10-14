export const TILE = 32;
export const W = 640;
export const H = 480;
export const GAME_TITLE = '잊힌 교실'; // 2026-10-14 확정
export const FONT = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
export const MAPS = ['bedroom', 'school1f', 'school2f', 'rooftop'];

// 개발자 모드 (?dev, ?dev&start=<체크포인트 id>) — src/dev.js 참고
const params = new URLSearchParams(location.search);
export const DEV = params.has('dev');
export const DEV_START = params.get('start');
