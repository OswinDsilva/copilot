// Quick test to check similarity scores
import { similarityRatio } from './src/router/helpers/fuzzyMatch';

console.log('production vs prediction:', similarityRatio('production', 'prediction'));
console.log('production vs projection:', similarityRatio('production', 'projection'));
console.log('production vs product:', similarityRatio('production', 'product'));

// Test the threshold
const threshold = 0.70; // for 10+ letter words
console.log('\nWith threshold 0.70:');
console.log('production matches prediction?', similarityRatio('production', 'prediction') >= threshold);
console.log('production matches projection?', similarityRatio('production', 'projection') >= threshold);
