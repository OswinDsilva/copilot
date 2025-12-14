# ChartRenderer.tsx Bug Report (Updated Dec 8, 2025)

## Issues Identified

### 1. CSV Export Newline Bug (rowsToCSV)
- **Issue:** The `rowsToCSV` function used an invalid string split for newlines, which could break CSV export. It should use `\n` for newlines in both the escape check and the join.
- **Severity:** Medium (affects CSV export).
- **Status:** Needs fix if not already addressed.

### 2. normalizeRows Robustness
- **Issue:** The `normalizeRows` function now robustly handles multiple backend shapes: array of rows, `{ rows: [...] }`, and `{ columns, data }` matrix. This prevents silent data loss if the backend shape changes.
- **Severity:** Minor (now fixed in current code).

### 3. Event Handler Consistency
- **Issue:** Not all adapters implement `onPointClick` or `onHover` (e.g., Radar, Heatmap, Custom). This is not a bug, but for consistent interactivity, you may want to add these handlers where possible.
- **Severity:** Minor (feature consistency, optional).

### 4. Container Ref Type (SVG Export)
- **Issue:** The `containerRef` is typed as `HTMLElement | null` and attached to a `div`. The SVG export logic is safe, but if the structure changes, this could break. No immediate bug.
- **Severity:** Minor (future-proofing, optional).

### 5. Adapters and Chart Containers
- **Issue:** All adapters use the correct Recharts containers (`ComposedChart` for XY and Pareto, SVG for Heatmap, etc.). No bug found here.
- **Severity:** None.

---

## Summary Table

| Issue                        | Location         | Severity | Status/Fix Needed? |
|------------------------------|------------------|----------|--------------------|
| CSV export newline bug       | rowsToCSV        | Medium   | Needs fix          |
| normalizeRows robustness     | normalizeRows    | Minor    | Fixed              |
| Event handler consistency    | Adapters         | Minor    | Optional           |
| Container ref type           | SVG Export       | Minor    | Optional           |
| Chart container usage        | Adapters         | None     | OK                 |

---

### Recommended Immediate Fix
- Fix the newline handling in `rowsToCSV` to use `\n` correctly if not already done.

---

**Last reviewed:** Dec 8, 2025
