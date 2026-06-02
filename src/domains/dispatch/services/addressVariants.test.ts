import { describe, it, expect } from 'vitest';
import {
  buildGeocodeQueryVariants,
  buildUserFacingAddressHints,
  stripLeadingBrandToDistrictRoadVariants,
} from './addressVariants';

describe('buildGeocodeQueryVariants', () => {
  it('빈 입력은 빈 배열', () => {
    expect(buildGeocodeQueryVariants('   ')).toEqual([]);
  });
  it('원본을 항상 첫 변형으로 포함하고 중복은 제거한다', () => {
    const out = buildGeocodeQueryVariants('서울특별시 서초구 서초대로 350');
    expect(out[0]).toBe('서울특별시 서초구 서초대로 350');
    expect(new Set(out).size).toBe(out.length);
  });
  it('광역 접두 제거 코어 변형을 추가한다', () => {
    const out = buildGeocodeQueryVariants('서울특별시 서초구 서초대로 350');
    expect(out).toContain('서초구 서초대로 350');
  });
  it('건물명이 붙어도 도로명+번지 코어를 뽑는다', () => {
    const out = buildGeocodeQueryVariants('서울특별시 금천구 가마산로 96 대륭테크노타운');
    expect(out).toContain('서울특별시 금천구 가마산로 96');
  });
});

describe('stripLeadingBrandToDistrictRoadVariants', () => {
  it('상호 접두가 붙은 주소에서 구+도로명 코어를 추출한다', () => {
    const out = stripLeadingBrandToDistrictRoadVariants('위펀푸드 서초구 서초대로 350');
    expect(out).toContain('서초구 서초대로 350');
    expect(out).toContain('서울특별시 서초구 서초대로 350');
  });
});

describe('buildUserFacingAddressHints', () => {
  it('6자 미만 힌트는 제외하고 최대 6개까지만 반환', () => {
    const out = buildUserFacingAddressHints('서울특별시 강남구 테헤란로 123 ABC빌딩 5층');
    expect(out.length).toBeLessThanOrEqual(6);
    expect(out.every((s) => s.length >= 6)).toBe(true);
  });
});
