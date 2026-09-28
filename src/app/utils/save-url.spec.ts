import {saveFromUrl} from './save-url';

describe('saveFromUrl', () => {
  it('clicks a hidden link to the file and leaves nothing behind', () => {
    const clicked: Array<{href: string; rel: string; display: string; attached: boolean}> = [];
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({
        href: this.href,
        rel: this.rel,
        display: this.style.display,
        attached: document.body.contains(this),
      });
    });
    saveFromUrl('https://storage.example/file?sig=1');
    expect(clicked).toEqual([{
      href: 'https://storage.example/file?sig=1',
      rel: 'noopener',
      display: 'none',
      attached: true,
    }]);
    expect(document.body.querySelector('a')).toBeNull();
    click.mockRestore();
  });
});
