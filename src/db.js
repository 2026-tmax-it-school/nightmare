// Boot 씬에서 data/*.json 을 읽어 채운다.
export const DB = {
  clues: {},
  items: {},
  fragments: {},
  people: [],   // 기억 노트 인물 탭 ({ name, desc, cond })
  timeline: [], // 기억 노트 타임라인 탭
  endings: {},
  puzzles: {},
  deductions: {},
  hints: {},
  cutscenes: {},
  maps: {},
  checkpoints: [], // 개발자 모드 전용
};
