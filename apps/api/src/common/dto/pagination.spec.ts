import { PaginationDto } from './pagination.dto';

describe('PaginationDto', () => {
  it('defaults to page 1, pageSize 20 → skip 0, take 20', () => {
    const d = new PaginationDto();
    expect(d.page).toBe(1);
    expect(d.pageSize).toBe(20);
    expect(d.skip).toBe(0);
    expect(d.take).toBe(20);
  });

  it('derives skip from page/pageSize', () => {
    const d = new PaginationDto();
    d.page = 3;
    d.pageSize = 10;
    expect(d.skip).toBe(20);
    expect(d.take).toBe(10);
  });

  it('page 1 always starts at offset 0', () => {
    const d = new PaginationDto();
    d.page = 1;
    d.pageSize = 50;
    expect(d.skip).toBe(0);
  });
});
