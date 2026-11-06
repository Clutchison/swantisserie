import { itemTexts } from './play-tab-harness';

/** A list of `items`, each given as its markup. */
function listOf(...items: string[]) {
  const list = document.createElement('ul');
  list.innerHTML = items.map((item) => `<li>${item}</li>`).join('');
  return list;
}

describe('itemTexts, the play tab harness’s read of a list', () => {
  it('reads a name wrapped in an element, leaving out the item’s buttons and button groups', () => {
    const list = listOf(
      '<img alt=""> <span class="name">Bob</span> <button>Remove</button>',
      '<span>vs <b>Carol</b></span> <button>Report</button> <div role="group"><button>Won 2–0</button></div>',
    );

    expect(itemTexts(list)).toEqual(['Bob', 'vs Carol']);
  });
});
