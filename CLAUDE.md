# rummikub 프로젝트 규칙

## 경제(Economy) 탭 — 리소스팩 자동 반영 규칙 (필수)
새 블럭을 추가할 때는 반드시 아래를 지켜 `resourcepack/` 텍스처가 자동 적용되게 한다:

1. **타일명 = 공식 MC 텍스처 파일명**을 기본으로 한다 (예: `stone`, `oak_planks`, `red_wool`).
   공식 파일명과 다르게 지어야 한다면 `economy3d.js`의 `RP_ALIAS`에 별칭을 추가한다.
2. **블럭 종류마다 리소스팩 이미지 구성이 다르다** — 추가 시 아래 유형을 확인해 처리한다:
   - 다면 블럭: top/side/bottom 각각 타일 필요 (예: `grass_block_top` / `grass_block_side`)
   - 회색조+틴트: 원본이 회색이라 색을 곱해야 함 → `RP_TINT`에 색 등록
     (잔디 윗면 `#7cbd6b`, 잎 기본 `#48b518`, 가문비잎 `#619961`, 자작잎 `#80a755`, 물 `#3f76e4`)
   - 애니메이션 스트립: 세로로 긴 다중 프레임(물/용암/마그마/불) → 로더가 자동 감지해
     `_fluidAnim.strips`로 프레임 순환. 새 애니메이션 블럭은 자동 처리됨.
   - 엔티티 텍스처(상자/침대/표지판): block 폴더에 없음 → 내장 절차 텍스처 유지.
3. 파괴 금 가기: `resourcepack/destroy_stage_0..9.png` 자동 사용 (`buildCrackAssets`).
4. 텍스처 PNG 파일 자체는 사용자가 직접 넣는다 — 에이전트가 모장 원본 에셋을 구해 커밋하지 않는다.
5. 새 블럭에는 항상 아이템 정의(economy-data.js) + 조합/제련 레시피(바닐라 그대로) +
   경도(homeBlockHardness) + 히트박스(비정육면체면 blockBoxes/emitShapedBlock)를 함께 추가한다.
6. 블럭 ID는 Uint16 월드 저장소 기준(65,535종까지). Uint8로 되돌리지 말 것.

## 검증 규칙
- 수정 후: `node --check` 4개 파일 + scratchpad의 econ_test.js / econ3d_test.js + Playwright 프로브 실행.
- 월드 재건축 시 pw_foreign(이물 블럭)·pw_audit(나무 위 나무/공허 몹) 스캔으로 회귀 확인.

## 배포 규칙
- main 병합 = GitHub Pages 자동 배포. 배치 단위: 커밋 → 푸시 → PR → 스쿼시 병합 → 브랜치 main 동기화.
