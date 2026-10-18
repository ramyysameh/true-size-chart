import { TrueSizeFinder } from './finder/element';
import { renderBody } from './finder/screens/body';
import { renderChart } from './finder/screens/chart';
import { renderFit } from './finder/screens/fit';
import { renderShape } from './finder/screens/shape';

// Task 7 registers result here.
TrueSizeFinder.defaultScreens.set('body', renderBody);
TrueSizeFinder.defaultScreens.set('shape', renderShape);
TrueSizeFinder.defaultScreens.set('fit', renderFit);
TrueSizeFinder.defaultScreens.set('chart', renderChart);

if (!customElements.get('true-size-finder')) customElements.define('true-size-finder', TrueSizeFinder);

export { TrueSizeFinder };
