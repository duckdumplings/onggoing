-- 테스트용 시드 데이터
-- 생성일: 2025-01-27

-- 테스트 사용자 프로필 추가 (실제 auth.users가 없으므로 주석 처리)
-- INSERT INTO public.user_profiles (id, email, full_name, role, company_name)
-- VALUES 
--   ('00000000-0000-0000-0000-000000000001', 'admin@onggoing.com', '옹고잉 관리자', 'admin', '옹고잉'),
--   ('00000000-0000-0000-0000-000000000002', 'manager@onggoing.com', '옹고잉 매니저', 'manager', '옹고잉'),
--   ('00000000-0000-0000-0000-000000000003', 'customer@example.com', '테스트 고객', 'customer', '테스트 회사');

-- 테스트 차량 정보 추가
INSERT INTO public.vehicles (vehicle_type, license_plate, capacity_weight, capacity_volume, fuel_type)
VALUES 
  ('레이', '12가3456', 1000.00, 3.5, 'gasoline'),
  ('스타렉스', '34나5678', 1500.00, 5.0, 'diesel');

-- 테스트 배송지 정보 추가
INSERT INTO public.destinations (name, address, latitude, longitude, contact_name, contact_phone, estimated_time, priority)
VALUES 
  ('서울 강남구', '서울특별시 강남구 테헤란로 123', 37.5665, 127.0123, '김담당', '010-1234-5678', 30, 'high'),
  ('부산 해운대구', '부산광역시 해운대구 해운대로 456', 35.1586, 129.1603, '박담당', '010-2345-6789', 45, 'medium'),
  ('대구 중구', '대구광역시 중구 동성로 789', 35.8714, 128.6014, '이담당', '010-3456-7890', 60, 'low');

-- 테스트 견적 정보 추가 (customer_id는 null로 설정)
INSERT INTO public.quotes (customer_id, quote_number, quote_type, origin_address, destination_address, distance, estimated_time, base_fare, additional_fare, total_fare, vehicle_type, status)
VALUES 
  (NULL, 'Q-2025-001', 'time_based', '서울특별시 강남구', '부산광역시 해운대구', 450.50, 300, 50000.00, 25000.00, 75000.00, '스타렉스', 'sent'),
  (NULL, 'Q-2025-002', 'quick_single', '서울특별시 강남구', '대구광역시 중구', 320.75, 240, 30000.00, 15000.00, 45000.00, '레이', 'draft');

-- 테스트 견적 상세 정보 추가
INSERT INTO public.quote_details (quote_id, item_name, quantity, weight, volume, special_requirements)
VALUES 
  ((SELECT id FROM public.quotes WHERE quote_number = 'Q-2025-001'), '전자제품', 2, 50.00, 0.5, '깨지기 쉬운 물품'),
  ((SELECT id FROM public.quotes WHERE quote_number = 'Q-2025-002'), '의류', 5, 30.00, 1.0, '신선도 유지 필요'); 