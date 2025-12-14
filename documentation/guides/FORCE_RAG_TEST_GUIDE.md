# Force RAG Testing Guide

## How to Test the Feature

### Step 1: Refresh Your Browser
**IMPORTANT**: Clear your browser cache or do a hard refresh:
- Chrome/Edge: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- Firefox: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)

### Step 2: Open Browser Console
Press `F12` to open Developer Tools and go to the Console tab

### Step 3: Test WITHOUT Force RAG (Default Behavior)

1. **Leave checkbox UNCHECKED**
2. Type: "What was the highest production day?"
3. Click Send
4. **Expected Console Output**:
   ```
   [Routing Decision] { task: 'sql', confidence: 0.X, ... }
   ```
5. **Expected Result**: SQL error (because router chose SQL)

### Step 4: Test WITH Force RAG (Checkbox Checked)

1. **CHECK the "Force RAG" checkbox** ☑
2. Type: "What was the highest production day?"
3. Click Send
4. **Expected Console Output**:
   ```
   [ChatTab] Submitting question: What was the highest production day? Force RAG: true Route Override: rag
   [Force RAG] User forced route: rag
   [Routing Decision] { task: 'rag', confidence: 1.0, reason: 'User forced route via checkbox', namespaces: ['combined', 'production_summary'] }
   ```
5. **Expected Result**: RAG searches documents and returns answer about production data

## Debugging Steps

### If Checkbox Doesn't Force RAG

**Check Console for**:
1. `[ChatTab]` log showing `Force RAG: true`
2. `[Force RAG]` log showing route override
3. `[Routing Decision]` showing `task: 'rag'`

**If logs are missing**:
- Hard refresh browser (Ctrl+Shift+R)
- Check if checkbox is actually checked
- Verify checkbox is visible on page

### If Still Using SQL After Checking

**Problem**: Old JavaScript cached in browser

**Solution**:
1. Close browser tab completely
2. Clear browser cache
3. Reopen application
4. Try again

## Visual Verification

### Checkbox Should Look Like This

**Unchecked (Default)**:
```
☐ Force RAG (search documents instead of SQL database)
```

**Checked**:
```
☑ Force RAG (search documents instead of SQL database)
```

**While Loading**:
```
☐ Force RAG (search documents instead of SQL database)  [grayed out]
```

## Test Questions

### Good Questions to Test Force RAG

✅ **Production Data Questions**:
- "What was the highest production day?"
- "Show me production data for April"
- "Compare shift A and shift B production"
- "What was production in January?"

✅ **SQL Questions (to verify override)**:
- "How many trips today?" (normally SQL, but RAG when forced)
- "List all equipment" (normally SQL, but RAG when forced)

### Expected Results

| Question | Checkbox | Expected Route | Expected Result |
|----------|----------|----------------|-----------------|
| "Highest production day?" | Unchecked | SQL | SQL Error (GROUP BY) |
| "Highest production day?" | **Checked** | **RAG** | **Finds highest from docs** |
| "How many trips today?" | Unchecked | SQL | COUNT result |
| "How many trips today?" | **Checked** | **RAG** | **"Not enough evidence"** |

## Common Issues

### Issue 1: Checkbox Not Visible
**Cause**: Browser cache
**Fix**: Hard refresh (Ctrl+Shift+R)

### Issue 2: Checkbox Doesn't Stay Checked
**Cause**: State reset or form issue
**Fix**: Check console for errors, refresh page

### Issue 3: Still Gets SQL Error
**Cause**: Route override not working
**Fix**: 
1. Check console logs
2. Verify checkbox is checked before clicking Send
3. Hard refresh browser
4. Clear cache completely

### Issue 4: No Console Logs
**Cause**: Old build cached
**Fix**: 
1. Open Developer Tools (F12)
2. Right-click refresh button
3. Select "Empty Cache and Hard Reload"

## Success Criteria

✅ Checkbox visible below input field
✅ Checkbox can be checked/unchecked
✅ Console shows correct logs
✅ Route changes from SQL to RAG when checked
✅ Question gets RAG answer (not SQL error)
✅ Answer shows "Route: RAG" in the response

## Quick Test Script

**Copy and paste this checklist**:

- [ ] Refresh browser with Ctrl+Shift+R
- [ ] Open console (F12)
- [ ] See checkbox below input field
- [ ] Checkbox is unchecked by default
- [ ] Type: "What was the highest production day?"
- [ ] WITHOUT checking: Get SQL error
- [ ] CHECK the Force RAG checkbox
- [ ] Type same question again
- [ ] See console log: `[Force RAG] User forced route: rag`
- [ ] See console log: `[Routing Decision] { task: 'rag', ... }`
- [ ] Get RAG answer (not SQL error)
- [ ] Answer shows production data from April
- [ ] Success!

## If All Else Fails

1. **Close all browser tabs**
2. **Clear browser cache completely**:
   - Chrome: Settings > Privacy > Clear browsing data > Cached images and files
   - Firefox: Options > Privacy > Clear Data > Cached Web Content
3. **Restart browser**
4. **Open application fresh**
5. **Test again**

The force RAG feature is working - you just need to ensure the new build is loaded!
