# Equipment Optimization & Forecasting Feature

## Overview
The Mining Co-Pilot now includes intelligent equipment optimization and production forecasting capabilities to help you make data-driven decisions about equipment selection and production planning.

## Features

### 1. Equipment Selection Optimization
Recommends the best combination of excavators and tippers based on historical performance data.

**Example Questions:**
- "I have to pick 1 excavator and 3 tippers which combination should I take?"
- "Which excavator and 2 tippers should I choose?"
- "Best combination for 2 excavators and 4 tippers"

**Output Includes:**
- Recommended excavator(s) and tippers
- Expected trips per shift
- Confidence score
- Reasoning based on historical data
- Alternative combinations

### 2. Production Forecasting
Predicts future production trends using historical data and statistical models.

**Example Questions:**
- "Forecast production for next 7 days"
- "Predict trips for next 14 days"
- "What will production look like next week?"

**Output Includes:**
- Daily predictions with confidence levels
- Trend direction (increasing/decreasing/stable)
- Trend percentage
- Based on moving averages and linear regression

## How It Works

### Equipment Optimization Algorithm
1. **Data Collection**: Analyzes historical performance from `trip_summary_by_date` table
2. **Performance Scoring**: Calculates efficiency based on:
   - Average trips per shift (40% weight)
   - Total trips completed (30% weight)
   - Consistency of usage (30% weight)
3. **Combination Generation**: Creates all possible combinations of requested equipment
4. **Scoring & Ranking**: Scores each combination and ranks by performance
5. **Recommendation**: Returns top combination with alternatives

### Forecasting Model
1. **Historical Analysis**: Retrieves trip data from database
2. **Trend Calculation**: Uses linear regression to identify trends
3. **Moving Average**: Calculates 7-day moving average for smoothing
4. **Prediction**: Projects future values based on trend + moving average
5. **Confidence Scoring**: Decreases confidence for longer-term predictions

## Testing

### Manual Testing Steps

1. **Test Equipment Optimization**:
   ```
   Ask: "I have to pick 1 excavator and 3 tippers which combination should I take?"

   Expected: Should recommend optimal combination from:
   - Excavators: EX-139, EX-141, EX-189
   - Tippers: BB-44, BB-45, BB-52, BB-53, BB-56, BB-57, BB-62, BB-78
   ```

2. **Test Forecasting**:
   ```
   Ask: "Forecast production for next 7 days"

   Expected: Should show 7 daily predictions with:
   - Dates
   - Predicted trip counts
   - Confidence percentages
   - Trend direction
   ```

3. **Test Edge Cases**:
   ```
   Ask: "I need 10 excavators and 20 tippers"

   Expected: Should show error message explaining only 3 excavators and 8 tippers available
   ```

## Implementation Details

### Files Created/Modified
- **`src/services/optimizer.ts`**: Core optimization and forecasting logic
- **`src/services/__tests__/optimizer.test.ts`**: Test suite for optimizer
- **`src/services/router.ts`**: Added PRIORITY 0 for optimization routing
- **`src/App.tsx`**: Integrated optimization handling in message flow
- **`src/utils/supabase.ts`**: Enhanced to support Node.js environment for testing

### Key Functions
- `getEquipmentPerformanceData()`: Retrieves and calculates performance metrics
- `optimizeEquipmentSelection()`: Finds optimal equipment combinations
- `forecastProduction()`: Predicts future production values
- `calculateEfficiency()`: Scores equipment performance
- `scoreCombination()`: Evaluates equipment combinations

### Data Sources
- `trip_summary_by_date` table: Historical trip data by equipment
- Columns used:
  - `excavator`: Excavator ID
  - `tipper_id`: Tipper ID
  - `trip_count`: Number of trips per shift
  - `trip_date`: Date of operations

## Performance Characteristics

### Optimization
- **Data Points**: Analyzes all historical combinations
- **Speed**: Fast (<1s for typical datasets)
- **Accuracy**: Based on actual performance data
- **Confidence**: Higher for frequently used combinations

### Forecasting
- **Minimum Data**: Requires at least 7 days of historical data
- **Lookback**: Uses last 30 days for trend analysis
- **Prediction Range**: 1-30 days (confidence decreases over time)
- **Method**: Moving average + linear regression

## Future Enhancements

Potential improvements:
1. **Machine Learning**: Implement ML models for better predictions
2. **Seasonal Adjustment**: Account for seasonal patterns
3. **Weather Integration**: Factor weather data into forecasts
4. **Maintenance Scheduling**: Consider equipment maintenance in recommendations
5. **Multi-objective Optimization**: Balance productivity, fuel efficiency, and wear
6. **Real-time Updates**: Continuous learning from new data

## Troubleshooting

### "No historical performance data available"
- Ensure `trip_summary_by_date` table has data
- Verify excavator and tipper_id columns are populated

### "Insufficient historical data for forecasting"
- Need at least 7 days of trip data
- Check that trip_date and trip_count are populated

### Low confidence scores
- Indicates limited historical data for that combination
- Consider using more frequently used equipment

## Notes
- Recommendations are based on historical performance only
- Actual performance may vary due to operational conditions
- Always consider site-specific factors in final decisions
- Forecasts become less accurate further into the future
