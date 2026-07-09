# 리소스팩 (선택)

이 폴더에 16×16 PNG 텍스처를 넣으면 게임이 절차 생성 텍스처 대신 사용합니다.
**텍스처 파일은 저장소에 커밋하지 마세요** — 본인이 소유한 리소스의 개인적 사용만 허용됩니다.

## 사용법 (매니페스트 불필요 — 전 타일 자동 감지)
1. 이 폴더에 타일명과 같은 이름의 16×16 PNG를 넣습니다: `stone.png`, `dirt.png`, ...
2. 게임을 새로고침하면 **존재하는 모든 PNG가 자동 적용**됩니다 (적용 시 "🎨 리소스팩 N개 타일 적용됨" 토스트).
3. 게임의 모든 블럭 타일(약 120종)이 대상이며, 없는 파일은 내장 텍스처를 유지합니다.

## 주요 타일명
지형: stone dirt grass_top grass_side sand sandstone gravel cobble stonebrick bricks snow ice
나무: planks birch_planks spruce_planks dark_oak_planks jungle_planks acacia_planks log_side log_top birch_side leaves spruce_leaves
광석: coal_ore iron_ore gold_ore lapis_ore redstone_ore diamond_ore emerald_ore
네더/엔드: netherrack soul_sand nether_bricks magma glow obsidian end_stone purpur quartz
기능: crafting_table_top crafting_table_side furnace_top furnace_side chest_top chest_side ladder bed_top bed_side glass water lava
