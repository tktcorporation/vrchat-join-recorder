import { groupingPhotoListToPreviewByWorldJoinInfo } from './service';

describe('groupingPhotoListToPreviewByWorldJoinInfo', () => {
  it('should be defined', () => {
    const result = groupingPhotoListToPreviewByWorldJoinInfo([], []);
    expect(result).toStrictEqual([]);
  });

  it('join情報のみだった場合', () => {
    const result = groupingPhotoListToPreviewByWorldJoinInfo(
      [
        {
          worldId: 'wrld_1234',
          worldName: 'worldName',
          joinDatetime: new Date('2020-01-01'),
        },
      ],
      [],
    );
    expect(result).toStrictEqual([
      {
        world: {
          worldId: 'wrld_1234',
          worldName: 'worldName',
          joinDatetime: new Date('2020-01-01'),
        },
        tookPhotoList: [],
      },
    ]);
  });

  it('photo情報のみだった場合', () => {
    const result = groupingPhotoListToPreviewByWorldJoinInfo(
      [],
      [
        {
          photoPath: 'photoPath-1',
          tookDatetime: new Date('2020-01-02'),
        },
        {
          photoPath: 'photoPath-2',
          tookDatetime: new Date('2020-01-03'),
        },
      ],
    );
    expect(result).toStrictEqual([]);
  });

  it('joinの前にphoto情報があった場合', () => {
    const result = groupingPhotoListToPreviewByWorldJoinInfo(
      [
        {
          worldId: 'wrld_1234',
          worldName: 'worldName',
          joinDatetime: new Date('2020-01-03'),
        },
      ],
      [
        {
          photoPath: 'photoPath-1',
          tookDatetime: new Date('2020-01-02'),
        },
        {
          photoPath: 'photoPath-2',
          tookDatetime: new Date('2020-01-01'),
        },
      ],
    );
    expect(result).toStrictEqual([
      {
        world: {
          worldId: 'wrld_1234',
          worldName: 'worldName',
          joinDatetime: new Date('2020-01-03'),
        },
        tookPhotoList: [],
      },
    ]);
  });

  it('1対1でグルーピング', () => {
    const result = groupingPhotoListToPreviewByWorldJoinInfo(
      [
        {
          worldId: 'wrld_1234',
          worldName: 'worldName',
          joinDatetime: new Date('2020-01-01'),
        },
      ],
      [
        {
          photoPath: 'photoPath',
          tookDatetime: new Date('2020-01-02'),
        },
      ],
    );
    expect(result).toStrictEqual([
      {
        world: {
          worldId: 'wrld_1234',
          worldName: 'worldName',
          joinDatetime: new Date('2020-01-01'),
        },
        tookPhotoList: [
          {
            photoPath: 'photoPath',
            tookDatetime: new Date('2020-01-02'),
          },
        ],
      },
    ]);
  });

  it('1対2でグルーピング', () => {
    const result = groupingPhotoListToPreviewByWorldJoinInfo(
      [
        {
          worldId: 'wrld_1234',
          worldName: 'worldName',
          joinDatetime: new Date('2020-01-01'),
        },
      ],
      [
        {
          photoPath: 'photoPath1',
          tookDatetime: new Date('2020-01-02'),
        },
        {
          photoPath: 'photoPath2',
          tookDatetime: new Date('2020-01-03'),
        },
      ],
    );
    expect(result).toStrictEqual([
      {
        world: {
          worldId: 'wrld_1234',
          worldName: 'worldName',
          joinDatetime: new Date('2020-01-01'),
        },
        tookPhotoList: [
          {
            photoPath: 'photoPath1',
            tookDatetime: new Date('2020-01-02'),
          },
          {
            photoPath: 'photoPath2',
            tookDatetime: new Date('2020-01-03'),
          },
        ],
      },
    ]);
  });
  it('1:2, 1:2 でグルーピング', () => {
    const result = groupingPhotoListToPreviewByWorldJoinInfo(
      [
        {
          worldId: 'wrld_1234',
          worldName: 'worldName',
          joinDatetime: new Date('2020-01-01'),
        },
        {
          worldId: 'wrld_5678',
          worldName: 'worldName',
          joinDatetime: new Date('2020-01-03'),
        },
      ],
      [
        {
          photoPath: 'photoPath1',
          tookDatetime: new Date('2020-01-02'),
        },
        {
          photoPath: 'photoPath2',
          tookDatetime: new Date('2020-01-02'),
        },
        {
          photoPath: 'photoPath3',
          tookDatetime: new Date('2020-01-04'),
        },
        {
          photoPath: 'photoPath4',
          tookDatetime: new Date('2020-01-05'),
        },
      ],
    );
    expect(result).toStrictEqual([
      {
        world: {
          worldId: 'wrld_1234',
          worldName: 'worldName',
          joinDatetime: new Date('2020-01-01'),
        },
        tookPhotoList: [
          {
            photoPath: 'photoPath1',
            tookDatetime: new Date('2020-01-02'),
          },
          {
            photoPath: 'photoPath2',
            tookDatetime: new Date('2020-01-02'),
          },
        ],
      },
      {
        world: {
          worldId: 'wrld_5678',
          worldName: 'worldName',
          joinDatetime: new Date('2020-01-03'),
        },
        tookPhotoList: [
          {
            photoPath: 'photoPath3',
            tookDatetime: new Date('2020-01-04'),
          },
          {
            photoPath: 'photoPath4',
            tookDatetime: new Date('2020-01-05'),
          },
        ],
      },
    ]);
  });
});
