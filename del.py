import io
p = r"D:\PARK\01RailMind\src\store\useFlowStore.ts"
with io.open(p, "r", encoding="utf-8", newline="") as f:
    lines = f.readlines()
# delete 1-based lines 206..398 (inclusive of index 205..397) - also drop the trailing blank line after defaultThreads
del lines[205:398]
with io.open(p, "w", encoding="utf-8", newline="") as f:
    f.writelines(lines)
print("NEW_TOTAL", len(lines))
