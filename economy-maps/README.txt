경제 3D — 실제 섬 맵 파일 배치 안내
=====================================

이 폴더에 섬 맵 파일(.bin)을 넣으면 해당 섬이 절차 생성 대신 실제 맵으로 로드됩니다.
(리소스팩 텍스처 PNG를 직접 넣는 것과 동일한 방식 — CLAUDE.md 규칙 4.)

파일명 → 섬(월드 키):
  hub_map.bin     → 허브            (이미 포함)
  map_gold.bin    → 골드 광산       (gold)
  map_deep.bin    → 딥 캐번         (deep)
  map_spider.bin  → 스파이더 덴     (spider)
  map_end.bin     → 디 엔드         (end)
  map_park.bin    → 더 파크         (park)
  map_farming.bin → 더 반/농장 섬   (barn)
  map_crimson.bin → 크림슨 아일     (nether)  ※ 매우 큼(메모리 주의)
  map_mushroom.bin→ 버섯 사막       (mushroom)

파일이 없으면 그 섬은 기존 절차 생성으로 자동 폴백됩니다(오류 없음).
포맷: HMAP (헤더 + 팔레트 + gzip Uint16 grid). 로더는 economy3d.js의 loadIslandMap 참조.
