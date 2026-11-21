import {tick} from 'svelte';

/** Preserve both scroll positions when a container switches from list to detail. */
export class DetailNavigation {
  private origin?: {button: HTMLButtonElement; list: HTMLElement; position: number; page: number};

  capture(button: HTMLButtonElement) {
    const list = button.closest<HTMLElement>('.catalog-rows');
    if (list) this.origin = {button, list, position: list.scrollTop, page: window.scrollY};
  }

  async reveal(back: () => HTMLButtonElement | undefined) {
    await tick();
    const button = back();
    if (!button?.getClientRects().length) return;
    button.focus({preventScroll: true});
    button.scrollIntoView({block: 'start'});
  }

  async restore() {
    const origin = this.origin;
    this.origin = undefined;
    await tick();
    if (!origin?.button.isConnected) return;
    origin.list.scrollTop = origin.position;
    window.scrollTo(0, origin.page);
    origin.button.focus({preventScroll: true});
  }
}
