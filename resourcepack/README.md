# 리소스팩 (선택)

이 폴더에 16×16 PNG 텍스처를 넣으면 게임이 절차 생성 텍스처 대신 사용합니다.
**텍스처 파일은 저장소에 커밋하지 마세요** — 본인이 소유한 리소스의 개인적 사용만 허용됩니다.

## 사용법
1. `manifest.json` 파일을 이 폴더에 만들고 교체할 타일명을 나열:
```json
{ "tiles": ["stone", "dirt", "grass_top", "grass_side", "planks", "cobble", "sand", "leaves", "log_side", "log_top", "glass", "water", "lava", "netherrack", "obsidian", "glow"] }
```
2. 각 타일명과 같은 이름의 PNG를 넣습니다: `stone.png`, `dirt.png`, ...
3. 게임을 새로고침하면 자동 적용됩니다 (적용 시 "🎨 리소스팩 텍스처 적용됨" 토스트).

## 주요 타일명
지형: stone dirt grass_top grass_side sand sandstone gravel cobble stonebrick bricks snow ice
나무: planks birch_planks spruce_planks dark_oak_planks jungle_planks acacia_planks log_side log_top birch_side leaves spruce_leaves
광석: coal_ore iron_ore gold_ore lapis_ore redstone_ore diamond_ore emerald_ore
네더/엔드: netherrack soul_sand nether_bricks magma glow obsidian end_stone purpur quartz
기능: crafting_table_top crafting_table_side furnace_top furnace_side chest_top chest_side ladder bed_top bed_side glass water lava
