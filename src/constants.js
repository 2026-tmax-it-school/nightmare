export const TILE = 32;
export const W = 640;
export const H = 480;
export const GAME_TITLE = '잊힌 교실'; // 2026-10-14 확정
export const FONT = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
export const TITLE_FONT = '"Noto Serif KR", "Batang", "Apple Myungjo", serif'; // 타이틀 글자 (SemiBold 600)
export const MAPS = ['bedroom', 'school1f', 'school2f', 'rooftop'];

// 개발자 모드 (?dev, ?dev&start=<체크포인트 id>) — src/dev.js 참고
const params = new URLSearchParams(location.search);
export const DEV = params.has('dev');
export const DEV_START = params.get('start');

// 1인칭 화면(칸막이·거울·사진)용 CG. 컷신이 아니라 Boot가 따로 불러온다 (assets/cg/<이름>.png). 칸막이는 stall_<kind>, 거울은 mirror_*, 사진은 photo_graduation이 있으면 그 그림을 쓴다
export const VIEW_CGS = ['stall_empty', 'stall_scratch', 'stall_knock', 'stall_graffiti', 'stall_clogged', 'stall_burnt', 'mirror_bedroom', 'mirror_now', 'mirror_now_fog', 'mirror_now_cracked', 'mirror_young', 'photo_graduation',
  // 거울 속 사람만 움직이게 나눈 그림 (tools/split_person.py)
  'mirror_now_back', 'mirror_now_person', 'mirror_now_fog_back', 'mirror_now_fog_person', 'mirror_young_back', 'mirror_young_person', 'mirror_bedroom_back', 'mirror_bedroom_person'];
// 점프스케어 그림 (src/ui/jumpscare.js, 이슈 #113). assets/cg/<이름>.png를 만들면 여기 이름을 넣는다. 없으면 임시 그림
export const SCARE_CGS = ['scare_cabinet', 'scare_extbox', 'scare_drawer', 'scare_shelf'];
