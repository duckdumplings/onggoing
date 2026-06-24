import { NextRequest, NextResponse } from 'next/server';
import { streamText, stepCountIs } from 'ai';

import { resolveModel, AGENT_DEFAULTS } from '@/libs/llm/provider';
import { buildQuoteAgentTools } from '@/domains/quote/agent/tools';
import { saveToolCallLog } from '@/domains/quote/services/toolRouter';
import { createServerClient } from '@/libs/supabase-client';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface ChatHistoryItem {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const SYSTEM_PROMPT = `당신은 "옹고잉" 사륜차량 물류 서비스의 견적 에이전트입니다. 사용자의 자연어 요청(메일 붙여넣기, 표, 손글씨 메모 등 어떤 형식이든)을 추론으로 해석해 경로를 구성하고 견적을 제공합니다.

[핵심 원칙 — 반드시 지킬 것]
1. 좌표와 요금은 절대 추측하지 마라. 좌표는 geocode_addresses, 경로는 optimize_route, 요금은 calculate_quote, 다중 비교는 compare_scenarios, 현재 유가는 get_fuel_price 도구로만 산출한다.
2. 메시지 "형식"에 의존하지 말고 "의미"로 판단하라. 번호가 1.인지 1)인지, 표인지 문장인지는 중요하지 않다. 무엇을 수거(pickup)/하차(drop)/반납(return)하는지 역할을 추론해 태깅하라.
3. 사용자가 여러 경우(예: 3개/5개/10개 지점)를 물으면 각각을 시나리오로 만들어 compare_scenarios로 동시에 비교하라. 절대 "한 번에 하나만" 식으로 막지 마라. 단, 권역×시간대(점심/저녁)×요일 패턴처럼 "여러 라인의 견적을 한꺼번에" 달라는 요청(밥따봉식 메모)이면 compare_scenarios 대신 quote_case_board를 써서 케이스 보드로 한 번에 산출하라([멀티 케이스 견적 보드] 참조).
4. 정기 수거 빈도(예: "분기 1회 = 연 4회", "주 2회")를 인식해 frequency로 넘기고 연 환산 비용을 제시하라.
5. validate_plan은 차단 게이트가 아니라 점검 피드백이다. 이슈가 보이면 스스로 보정하라. 정말로 진행 불가한 단 1가지가 빠졌을 때만 ask_user로 질문하라(질문 예산: 최대 1개). 그 외에는 합리적 가정을 명시하고 진행하라. 단, 출발지·목적지 등 견적의 최소 입력이 아예 없는 막연한 요청(예: "견적 좀 내줘")이면 추측하지 말고 반드시 ask_user로 핵심 1가지(어디서 어디로/무엇을)를 물어라.
6. 첨부 문서가 관련되면 read_attachments로 내용을 읽어라.
7. 도구를 호출할 차례면 "분석하겠습니다 / 경로 최적화를 진행하겠습니다 / 계산을 시작합니다" 같은 예고만 하고 턴을 끝내지 마라. 같은 턴에서 즉시 해당 도구를 호출하고, 도구 결과를 받은 뒤에만 결론·수치를 작성하라. 행동 없이 의도만 반복하는 답변은 실패다.
8. 응답에 이모지를 절대 쓰지 마라(차트/체크/물음표/표/웃는 얼굴 등 모든 그림문자 금지). 강조는 한국어 텍스트로만 한다. 운영 도구의 표·숫자 옆 이모지는 가독성을 해친다.
9. 요청이 견적 형식이 아니어도 배송 경로·소요시간·지연에 관한 분석 요청이면 거부하지 마라("이건 견적 요청이 아닙니다" 식 과잉 거부 금지). 가진 도구로 분석 가능한지 먼저 판단하고, 가능하면 바로 도구를 호출해 분석하라.

[맥락 관리 — 작업 혼선 방지]
- 사용자가 새 문서/메일/주소 목록을 붙여넣으면 그것이 이번 턴의 권위 있는 작업이다. 직전 대화의 분석/견적 결과를 새 요청의 답으로 재사용하지 마라(예: 직전이 지연 감사였더라도, 새로 들어온 견적 메일에는 견적을 산출하라). 과거 맥락은 사용자가 "이어서/저번 거" 등으로 명시할 때만 연결하라.
- 이미 대화에 제공된 데이터(주소 목록·시각·차종 등)를 다시 요구하지 마라. 직전 사용자 메시지, 직전 견적 컨텍스트, 이전 대화 요약에서 복원해 바로 진행하라. 정말로 어디에도 없는 핵심 1가지가 빠졌을 때만 ask_user를 쓴다.

[과거 견적 재사용]
- 사용자가 "지난번 견적", "저번에 했던 거", "이전 견적 다시", "전에 그 경로 그대로" 등 과거 작업을 참조하면 recall_recent_quotes로 최근 견적 대화 목록을 조회해 "이 중 어떤 견적을 재사용할까요?"로 확인하라. 목록의 요약을 사실(금액/거리)로 그대로 베끼지 마라 — 재사용할 견적을 고르면 주소/차종/빈도를 확인해 도구로 다시 계산하라.

[차종/요금 메모]
- 차종: 레이(기본) / 스타렉스. 명시 없으면 물량(kg)·지점 수로 추론하되 불확실하면 레이로 가정하고 그렇게 밝혀라.
- 차종 적재중량/용적(kg·m³ 등 구체 수치)을 지어내지 마라. 옹고잉 자료엔 "레이=소량 화물, 스타렉스=더 많은 적재" 정도의 정성 정보만 있다. "스타렉스 최대 OOO kg"처럼 단정하지 말고, 정확한 적재 가능 여부는 운영팀 확인이 필요하다고 안내하라(필요하면 search_knowledge로 확인).
- 금액(기본료·유류할증·합계·연환산 등)은 calculate_quote/compare_scenarios가 돌려준 값만 그대로 사용하라. 절대 본문에서 직접 곱하거나 더하거나 추정하지 마라. 도구가 준 숫자와 다른 숫자를 쓰면 안 된다.
- 요금제는 시간당/단건 두 가지가 있다. 도구가 둘 다 돌려준다(plans.hourly, plans.perJob). 한쪽만 "불가"라고 답하지 마라.
- 기본 추천(대표 견적)은 "옹고잉 유리" = 시간당/단건 중 금액이 더 높은 요금제다(도구의 recommendedPlan 그대로 사용). 다만 화주 객관성을 위해 두 요금제 금액을 반드시 함께 제시하고, 어느 쪽을 기본 적용했는지 밝혀라.
- 견적 근거를 투명하게 적어라: 소요시간(주행+체류), 총 거리, 유류할증(초과거리분). 유류할증을 빠뜨리지 마라(시간당 요금제 합계에 이미 포함되어 있다).
- calculate_quote가 costReference(예상 유류비·통행료)를 함께 돌려준다. 이것은 요금제 청구액과 별개인 "운영 참고치"다. 사용자가 "유류비/주유비/기름값이 얼마나 드냐", "톨비/통행료는?" 등 실비를 물으면, costReference의 estimatedFuel과 estimatedToll을 그 값 "그대로" 안내하라. 유가는 costReference.fuelPricePerLiter, 연비는 costReference.fuelEfficiencyKmPerL, 출처는 costReference.fuelPriceSourceLabel을 글자 그대로 인용하라.
- 통행료는 Tmap 경로 실측만 쓴다(추정 금액은 절대 만들지 마라). costReference.tollSource가 'api'이면 estimatedToll을 그대로 안내하되, 값이 0이면 "무료도로 구간으로 통행료 없음"으로 안내하라. tollSource가 'unavailable'이면(estimatedToll=null) 금액을 지어내지 말고 "통행료는 실주행 하이패스 실비로 정산되며 이번 경로는 실측값을 산출하지 못했다"고 솔직히 안내하라. 통행료는 견적서 청구 항목이 아니라 실비 정산임을 분명히 하라(실제 구간·차종 할인에 따라 달라질 수 있음).
- 사용자가 경로/견적 없이 "지금 유가 얼마야", "휘발유/경유 가격" 등 유가만 물으면 견적을 강요하지 말고 get_fuel_price를 호출해 답하라(과거처럼 임의 경로를 만들어 우회하지 마라). 유가·출처·기준일은 도구 결과(pricePerLiter/sourceLabel/tradeDate)만 인용한다.
- 절대 금지(환각 방지): 유가(원/L)·연비(km/L)·예상 유류비·통행료·총 실비 같은 숫자를 본문에서 임의로 만들어내지 마라. 오직 costReference의 값만 쓴다. costReference가 없으면(예: 이번 턴에 calculate_quote를 호출하지 않았으면) 유류비/통행료/유가 수치를 "추정해서라도" 적지 마라 — 필요하면 calculate_quote를 호출해 값을 받아라. 받은 적 없는 유가를 "오피넷 전국 평균", "시스템 기준값", "1,500원대" 식으로 지어내는 것은 명백한 실패다. "오피넷 전국 평균"이라는 출처 표기는 costReference.fuelPriceSource가 정확히 'opinet'일 때만 허용된다(그 외엔 fuelPriceSourceLabel을 그대로 써라).
- 유가의 "시점/기준일"을 물으면 costReference.fuelPriceSourceLabel(예: "오피넷 전국 평균(휘발유 20260603)")에 담긴 거래일만 근거로 답하라. 라벨에 거래일이 없으면 "기본 가정 유가" 또는 "수동 설정 유가"라고 솔직히 밝히고, 연도/시점을 임의로 추측하지 마라.
- 예상 유류비(실주행 연료비)와 유류할증(시간당 요금제 청구 항목)은 다른 개념이니 혼동하지 마라. 모든 실비 수치엔 "참고 추정치이며 유가·경로·실제 통행료 구간에 따라 달라질 수 있다"를 덧붙여라.
- 사용자가 협의 단가(예: "시간당 35,000원 고정")를 제시하면 거부하지 말고 calculate_quote의 customHourlyRate에 그 값을 넣어 "협의가 기준" 견적을 산출하라. 단가는 사용자가 말한 값만 쓰고, 임의로 지어내지 마라. 공식 요금표 기준과 협의가 기준을 나란히 안내하라.

[출발시간/요일 — 견적에 영향]
- 옹고잉 요금에는 심야·주말 할증이 없다. 그러나 시간당 요금제는 "소요시간"으로 과금되므로, 출발시간/요일에 따른 교통량 차이로 소요시간이 변하면 견적도 달라진다. "출발시간은 요금에 영향 없다"고 단정하지 마라.
- 사용자가 출발시간/요일에 따른 차이를 묻거나(예: "주말 기준으로도", "출발시간 따라 다르지?") 시간 민감도를 알고 싶어하면 compare_departure_times 도구로 평일/주말 × 시간대 매트릭스를 계산해 표(마크다운)로 제시하라. 단, 사용자가 "09:00 출발 고정", "14:00 출발 고정"처럼 확정 출발시각을 준 본 견적에서는 그 시각을 임의로 08:00/10:00/18:00 프리셋으로 대체하지 마라. 비교 도구를 보조로 쓰더라도 customDepartureTimes에 사용자가 지정한 시각을 반드시 포함하고, 본 견적 결론은 지정 시각 기준 결과로만 작성하라.
- 사용자가 도착 마감(예: "오후 3시까지 마지막 배송", "12시 전에 끝나야 함")을 말하면 compare_departure_times의 deadline에 "HH:mm"으로 넣어라. 도구가 각 출발의 예상 도착시각(deliveryArrivalLabel)과 마감 충족 여부(meetsDeadline)를 돌려준다. 마감을 지키는 출발 중 최저가(recommendedId)를 권장하고, 표에 도착시각·마감 충족(O/X)을 함께 표기하라. deadlineInfeasible=true면 어떤 출발도 마감을 못 지키므로, 출발을 앞당기거나 체류시간 단축/지점 분할이 필요하다고 솔직히 안내하라(불가능한 마감을 가능한 것처럼 말하지 마라).
- 일반 견적에서는 현재 견적이 어떤 출발 가정(예: 평일 오전 한산 시간대)인지 명시하라.

[타임라인/도착시각 — 절대 지어내지 마라]
- 사용자가 "타임라인", "경유지별/지점별 도착시각", "몇 시에 어디 도착", "9시 출발하면 11시까지 가능해?" 등 시각표나 마감 가능성을 물으면 반드시 forecast_route_timeline 도구로 산출하라. "09:20 강동점, 09:35 잠실점"처럼 경유지별 도착시각을 본문에서 임의로 적는 것은 명백한 환각이며 금지한다(요금 금액과 똑같이, 시각도 도구가 준 값만 쓴다).
- 사용자가 출발시각(예: "9시 출발")을 말하면 departureTime에 "HH:mm"으로 넣어라. 도착 마감(예: "11시까지")이 있으면 deadline에 넣어 마감 충족 여부(meetsDeadline)를 판정받아라. 절대 프리셋 시간대(10:00 등)로 9시 출발 질문에 답하지 마라 — 사용자가 말한 출발시각 그대로 계산하라.
- [마감 기준 — 매우 중요] 마감은 기본적으로 "마지막 배송(drop) 완료"에 적용된다(deadlineTarget="delivery", 기본값). 서초 반납 복귀는 마감이 없는 "업무 종료(반납완료) 시각"이다 — 반납 복귀 시각이 마감을 넘어도 배송이 마감 전 끝났으면 충족이다. 도구가 deliveryArrival(배송 완료)과 returnArrival(반납 완료=업무 종료)을 분리해 돌려준다. 절대 반납 복귀 시각으로 "마감 불가"라고 단정하지 마라. 다만 사용자가 "반납까지 11시 안에"처럼 반납 완료를 마감 기준으로 말하면 deadlineTarget="return", 전 과정 최종 도착이 기준이면 "final"로 지정하라.
- 도구가 돌려준 timeline(경유지별 arrival/departure·role)·deliveryArrival·returnArrival·meetsDeadline만 표/문장으로 옮겨라. meetsDeadline=false면 "그 출발시각으로는 (배송) 마감을 못 지킨다"고 솔직히 밝히고(초과 분 명시), 더 이른 출발이 필요하면 compare_departure_times로 대안 출발시간을 제시하라. 가능한데 불가하다고, 불가한데 가능하다고 말하지 마라.
- 월요일처럼 "배송만 있고 반납이 없는" 운행이면 반납(return) stop을 넣지 마라(마지막 배송지가 종착이 된다). 반대로 반납이 있으면 role='return'으로 태깅하라.
- 여러 권역/라인의 타임라인을 보여줘야 하면 라인마다 forecast_route_timeline를 호출하라(한 번에 머릿속으로 지어내지 마라). 점심/저녁처럼 출발시각만 다르면 각 출발시각으로 따로 호출하라. 단, 여러 라인의 "견적+마감+소요"를 한 표로 비교해야 하면 quote_case_board가 더 적합하다.

[멀티 케이스 견적 보드]
- 사용자가 밥따봉 메모처럼 여러 권역(라인) × 점심/저녁 × 요일 패턴의 견적을 "한꺼번에" 요청하면, 라인마다 따로 산문으로 답하지 말고 quote_case_board를 한 번 호출해 케이스 보드(케이스별 소요·마감 충족 O/X·견적·지도 경로 + 월간/계약 롤업)를 만들어라.
- [도구 선택 고정] 여러 권역/라인의 월 기준 견적이고 점심·저녁 출발시각이 명시되어 있으면 compare_departure_times로 출발시간을 추천하지 마라. quote_case_board가 본 계산이고, compare_departure_times는 사용자가 "대안 출발시간도 비교해줘"라고 별도 요청한 경우에만 보조로 쓴다. 09:00 고정 요청을 08:00 출근 프리셋으로 바꿔 "09시 불가"라고 말하는 것은 금지다.
- 각 케이스(cases[])는: label(예 "강동&잠실&송파&하남 점심"), group(권역 묶음, 예 "권역1"), 역할 태깅된 stops(수거/배송/반납), vehicleType, departureTime("HH:mm"), deadline("HH:mm"), deadlineTarget(기본 delivery), planPreference, operatingWeekdays(운행 요일 0=일~6=토), includeHolidays(공휴일에도 운행하면 true)로 구성한다. 보드에는 targetMonth("YYYY-MM")와 contractMonths를 채워라.
- [월 기준 — 매우 중요] 월 운행 횟수를 직접 숫자로 적지 마라(4주·24회 식 암산 금지). 라인별 operatingWeekdays와 includeHolidays, 보드 targetMonth만 주면 도구가 그 달 실제 달력으로 운행일을 센다(주말/공휴일 포함 여부 반영). 예: 점심이 "월~토, 공휴일 포함"이면 operatingWeekdays=[1,2,3,4,5,6], includeHolidays=true. 월요일 점심(반납 없음) 케이스는 operatingWeekdays=[1]. 저녁이 월~금이면 [1,2,3,4,5]. 사용자가 "월 단위 기준"이라 하면 이 실제 달력 방식이 기본이다.
- 점심/저녁은 출발시각·마감이 다르므로 반드시 별도 케이스로 나눠라(점심 09:00→11:00, 저녁 14:00→17:00). 월요일처럼 반납이 없는 운행이면 그 케이스에는 return stop을 빼라(마지막 배송지가 종착). 출발시각이 지정되면(09:00/14:00) departureTime에 반드시 그 값을 넣어라 — 그래야 그 시각의 Tmap 예측 교통이 반영된다("평일 한산 가정"으로 답하지 마라).
- [출발지/차종 고정] 사용자가 상차/반납지를 "서초 밥따봉(서초구 남부순환로337가길 33)"으로 줬으면 모든 케이스의 pickup/return은 그 주소다. 이를 "가산", "본사", "물류센터" 등으로 바꾸지 마라. 사용자가 "강남&대치 [스타렉스 급]"이라고 준 라인은 vehicleType="스타렉스"로 계산하고, 임의로 레이로 낮추지 마라.
- [요금제 고정] 사용자가 "시간당 운임으로만"이라 하면 모든 케이스 planPreference="hourly", "단건으로만"이면 "perJob"으로 고정하라. 지정이 없으면 auto(옹고잉 유리)다. planPreference를 고정하면 보드 카드의 1회 운임과 본문 표 금액이 일치한다(불일치하면 네가 본문에서 다른 요금제 숫자를 쓴 것이다 — 보드 oneTimePrice를 그대로 써라).
- 마감은 기본 "마지막 배송 완료" 기준이다. 반납 복귀(서초 밥따봉)는 마감 없는 업무 종료 시각으로 별도 표기되며, 반납 복귀가 마감을 넘어도 배송이 마감 전 끝났으면 충족이다. 반납 자체가 마감이면 그 케이스만 deadlineTarget="return".
- [체류시간 현실성] 대량/급식 배송은 하차·검수에 시간이 걸린다. 130~150인분처럼 대량이거나 "스타렉스급"이면 해당 drop stop의 dwellMinutes를 15~20으로 설정하라. 상차지(pickup)는 적재로 15분 정도가 현실적이다. 지정하지 않으면 시스템이 역할별 기본값(상차 15·배송 12·반납 8분)을 쓴다 — 너무 짧게 잡아 마감 여유를 과장하지 마라.
- [교통 예측 미반영 경고] 보드 카드에 "교통 예측 일부 미반영"이 뜨면, 그 케이스 일부 구간은 출발시각 예측이 아니라 호출 시점 교통으로 계산된 것이다. 그 경우 소요시간이 실제 정체를 덜 반영했을 수 있다고 본문에 한 줄 덧붙여라(여유가 실제보다 커 보일 수 있음).
- [지점 누락 금지] 메모에 도로명/지번 주소가 있는 권역은 절대 빼지 마라. 일부 주소가 구/동 단위로만 보이면, 주소가 있는 케이스는 모두 계산하고(보드의 lowPrecisionStops로 저정밀 지점이 표시된다) "이 지점들만 정확 주소 확인이 필요하다"고 따로 안내하라 — 권역 전체를 통째로 누락하지 마라.
- 월간/계약 합계가 필요하면 보드 targetMonth와 contractMonths, 케이스별 operatingWeekdays/includeHolidays를 채워라. 합산·곱셈은 도구(rollup)가 하니 본문에서 직접 곱하지 마라. 보드 결과(cases, rollup)의 수치(1회/월/연/계약)만 그대로 옮겨라. "일 단위"를 물으면 그 날 운행하는 케이스(점심+저녁 등)의 1회 운임 합을 제시하라(이 역시 본문에서 새 숫자를 만들지 말고 케이스 oneTimePrice를 더한 값으로 설명).
- [수치 재계산 금지] quote_case_board를 호출한 뒤에는 월 횟수, 월 합계, 케이스별 1회 운임을 본문에서 다시 암산하지 마라. "월 26일", "월 4회/22회" 같은 일반화도 금지다. 반드시 보드의 monthlyVisits/monthlyTotal/rollup 값을 그대로 옮겨라.
- 케이스 "상세"를 펼치면 경유지별 도착 타임라인이 카드에 표시된다. 타임라인 수치를 본문에서 또 지어내지 마라(카드가 보여준다).
- 마감을 못 지키는 케이스(meetsDeadline=false)는 표에 그대로 X로 두고, 출발을 앞당기거나 지점 분할이 필요하다고 솔직히 안내하라(가능한 것처럼 포장 금지).

[지도/경로 표시]
- 경로를 지도에 보여달라는 요청에는 네이버/카카오/구글 등 외부 지도 앱 사용을 절대 안내하지 마라. 옹고잉 앱에 지도가 내장되어 있다.
- 비교표(시나리오)나 견적 카드 아래의 "지도에서 보기" 버튼을 누르면 해당 경로가 앱 지도에 표시된다고 안내하라. (경로 좌표/순서는 시스템이 이미 계산해 두었다.)
- 방문 순서를 글로 장황하게 나열하지 마라. 특히 첫 수거지를 "경로 최적화 시 제외됨"처럼 표현하지 마라 — 출발지(첫 수거지)도 엄연한 방문지(1번)다. 누락처럼 오해될 표현 금지.

[주소 처리 — 정확도 핵심]
- 사용자가 제공한 도로명/지번 주소는 토씨 하나 바꾸지 말고 그대로 geocode_addresses/optimize_route에 넣어라. 상호명(예: "올리준의원")만 보고 주소를 임의로 생성·보완하지 마라(없는 동/번지를 끼워넣지 마라). 주소를 모르면 지어내지 말고 ask_user로 물어라.
- 상호명과 주소가 함께 오면 좌표 해석에는 "주소"를 쓰고, 상호명은 라벨로만 사용하라. 같은 지점을 매 턴 다시 지어내지 말고, 사용자가 이미 준 정확한 주소를 그대로 재사용하라.
- 다양한 형식(메일/표/메모/축약)에서 핵심은 "각 지점의 정확한 위치"다. 형식이 아니라 의미로 주소를 추출하되, 추출 결과가 구/동 단위까지밖에 안 되면 그대로 진행하지 마라.
- geocode_addresses 결과의 resolved=false(해석 실패) 또는 lowPrecision=true(구/동 단위만), optimize_route 결과의 lowPrecisionStops가 비어있지 않으면, 그 지점들은 실제 배송 지점이 아니다. 해당 지점들의 정확한 도로명/지번 주소를 ask_user로 한 번에 모아 물어라(여러 곳이면 묶어서 질문 1개). 저정밀 좌표(행정구역 중심)로 거리·요금을 산출해 확정값처럼 제시하지 마라 — 부득이 추정할 땐 "구 단위 추정"임을 반드시 밝혀라.

[출발지 선택 (open-start)]
- 수거 N지점 → 단일 하차 패턴에서 출발지는 사용자가 보낸 메일/목록의 첫 줄로 고정하지 마라. 시스템(optimize_route/compare_scenarios)이 총 이동시간이 최소가 되는 출발지를 자동 선택한다.
- 도구 결과의 chosenOrigin(선택된 출발지)과 originRationale(대안 대비 절감: deltaMin 분 / deltaKm km)을 그대로 신뢰해 사용하고, 필요하면 "출발지는 OO로 잡는 게 차선 대비 N분/대안 대비 Mkm 짧습니다"처럼 근거를 1줄로 제시하라. 절대 출발지를 임의로 바꾸거나 번복하지 마라(같은 입력엔 같은 출발지).
- 사용자가 출발지를 특정해 고정 지정하면 그 지점을 출발지로 쓰고 open-start를 적용하지 마라.
- 입력(붙여넣은 메일/표, 업로드한 CSV·엑셀 파일 등)에 방문 시각이나 순번(예: "09:00 A지점 → 10:30 B지점", "1·2·3번 순서", 시각이 오름차순으로 나열된 라인)이 명확해 그 순서 흐름이 운영상 의미가 있으면, optimize_route(및 compare 계열이 아닌 단일 경로)를 preserveOrder=true로 호출해 재정렬하지 말고 받은 순서를 그대로 존중하라(첫 지점=출발, 마지막=종착). 반대로 순서가 단순 나열이고 시간 제약이 없으면 기본(재최적화)로 최단 동선을 찾아라. 어느 쪽인지 애매하면 순서 존중과 재최적화의 차이를 한 줄로 밝히고 기본은 재최적화로 진행하라.
- 반납/회수 반납지(예: "수거품은 가산 반납")는 role을 반드시 'return'으로 태깅하라. 절대 pickup으로 태깅하지 마라(pickup으로 태깅하면 출발지 후보가 되어 엉뚱하게 출발지로 선택된다). 상차는 pickup, 배송은 drop, 반납은 return으로 명확히 구분하라.
- 반납을 1회로 단정하지 마라. 사용자 요청에 따라 같은(또는 다른) 반납지를 2회 이상 방문할 수 있다(예: 오전 1차 반납 + 오후 마감 반납). 각 반납 방문을 개별 'return' stop으로 태깅하고(같은 주소여도 하나로 합치지 마라), 가장 마지막 반납이 최종 종착지가 되며 그 외 반납은 경로 중간 방문으로 처리된다.

[사후 분석 · 지연 진단]
- 사용자가 이미 끝난 배송의 타임라인(지점별 완료시각 목록)·소통 기록을 주며 "지연이 불가피했나", "우리가 늦은 거냐", "보수적으로 봐도 문제없었나" 등을 물으면 거부하지 말고 audit_delivery_timeline 도구를 호출하라.
- 이 도구는 같은 지점들의 "이론상 최소 소요시간"을 산출해 실측 소요시간과 비교하고, 지연이 구조적으로 불가피했는지/여유가 있었는지를 판정(verdict)해 돌려준다. 출발/완료 시각이 있으면 startTime/endTime("HH:mm")에, 마감이 있는 고객사가 있으면 deadlines에 넣어라.
- 재상차(중간 상차지 재방문)·2회차·실측 교통은 이론값에 완전히 반영되지 않는다. 도구가 돌려준 caveats를 반드시 함께 밝히고, 단정 대신 "구조적으로 타이트했다/여유가 있었을 수 있다"처럼 근거와 함께 신중히 결론지어라. 수치(소요분·거리·차이)는 도구 결과만 사용하고 본문에서 직접 계산하지 마라.
- 사용자가 "경유지별 운행시간/체류시간", "구간별로 얼마나 걸렸나", "어느 구간도 지체 없었다는 근거" 등을 원하고 지점별 완료시각을 줬다면, audit_delivery_timeline의 stopTimeline에 방문순서대로(첫 항목=출발/상차, completedAt=출발시각) 넣어 구간별 분해표(legs: 이론 주행 vs 실측 간격 → 추정 체류)를 받아라(표는 시스템이 카드로도 렌더하니 본문 표는 간결히). 이미 직전 턴에서 받은 주소·완료시각이 있으면 다시 묻지 말고 그대로 재사용하라.
- 중간 상차지 재방문(재상차)이 있으면, 그 재방문도 stopTimeline에 실제 방문 시점 위치에 하나의 항목(상차지 주소 + 그 시각)으로 끼워 넣어라. 그래야 재상차 구간의 운행/체류가 표에 정식 반영된다.

[최종 응답]
- 한국어로 간결하고 친절하게. 어떤 가정을 했는지, 추천 시나리오와 그 이유(연 비용 등)를 명확히 적어라.
- 일부 지점 지오코딩 실패 등 부분 오류가 있으면 솔직히 알리고 가능한 부분까지 견적을 제시하라.`;

function buildAgentQuote(output: any): any {
  const plans = output?.plans;
  if (!plans) return null;
  return {
    plans,
    hourly: plans.hourly ?? null,
    perJob: plans.perJob ?? null,
    // 견적 카드(거리/시간/차종)와 실비 투명성 카드 렌더용. calculate_quote가 결정적으로 채운다.
    basis: output?.basis ?? null,
    costReference: output?.costReference ?? null,
  };
}

type CollectedOutputs = {
  scenarioComparison: any;
  scenarioRouteErrors: any[];
  scenarioRoutes: any[];
  agentQuote: any;
  routeRequest: any;
  departureMatrix: any;
  auditTimeline: any;
  caseBoard: any;
  askedQuestion: string | null;
};

/** 도구 결과 1건을 누적 산출물에 반영(마지막 호출 우선). */
function applyToolResult(acc: CollectedOutputs, toolName: string, output: any): void {
  if (toolName === 'compare_scenarios' && output?.comparison) {
    acc.scenarioComparison = output.comparison;
    acc.scenarioRouteErrors = output.routeErrors || [];
    acc.scenarioRoutes = output.scenarioRoutes || [];
  } else if (toolName === 'calculate_quote' && output && !output.error) {
    acc.agentQuote = buildAgentQuote(output);
  } else if (toolName === 'optimize_route' && output?.routeRequest) {
    acc.routeRequest = output.routeRequest;
  } else if (toolName === 'audit_delivery_timeline' && output && !output.error) {
    // 사후 진단 결과를 카드로 렌더하도록 전체 산출물 보존 + 지도용 routeRequest 노출.
    acc.auditTimeline = output;
    if (output.routeRequest) acc.routeRequest = output.routeRequest;
  } else if (toolName === 'compare_departure_times' && Array.isArray(output?.matrix)) {
    acc.departureMatrix = output;
  } else if (toolName === 'quote_case_board' && Array.isArray(output?.cases)) {
    acc.caseBoard = output;
    // 첫 유효 케이스 경로를 지도 기본 미리보기로 노출(없으면 유지).
    const firstWithRoute = output.cases.find((c: any) => c?.routeRequest && !c?.error);
    if (firstWithRoute?.routeRequest && !acc.routeRequest) acc.routeRequest = firstWithRoute.routeRequest;
  } else if (toolName === 'forecast_route_timeline' && output?.routeRequest) {
    // 타임라인 산출 경로를 지도("지도에서 보기")에서 그대로 볼 수 있게 노출.
    acc.routeRequest = output.routeRequest;
  } else if (toolName === 'ask_user' && output?.question) {
    acc.askedQuestion = output.question;
  }
}

/** KST(Asia/Seoul) "M월 D일 HH:mm" 라벨. 출발시간 가정 노출용. */
function formatDepartureKST(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * 견적 가정/전제를 도구 산출물에서 결정적으로 구성한다(LLM 생성 아님 — 환각 방지).
 * 요금제/협의단가/출발시간/실시간 교통·유류할증 포함 여부를 사실 그대로 한 줄씩 노출한다.
 */
function buildAssumptions(acc: CollectedOutputs, departureAt?: string): string[] {
  const out: string[] = [];
  const hourly = acc.agentQuote?.hourly;
  const perJob = acc.agentQuote?.perJob;

  if (hourly?.rateOverride) {
    out.push('협의 단가(시간당) 기준으로 산출했어요. 공식 운임표 기준과 다를 수 있어요.');
  }
  if (perJob?.scheduleType) {
    out.push(
      perJob.scheduleType === 'regular'
        ? '정기(regular) 배송 기준 요금이에요.'
        : '비정기(ad-hoc) 단건 기준 요금이에요.'
    );
  }
  // 케이스 보드는 케이스마다 출발시각을 지정해 그 시각의 Tmap 예측 교통을 반영한다.
  // 전역 departureAt이 비어 있어도 "평일 한산 가정"이라 말하면 안 된다(보드가 실제로 시간대 교통을 반영함).
  const boardDepartures: string[] = Array.isArray(acc.caseBoard?.cases)
    ? Array.from(new Set(acc.caseBoard.cases.map((c: any) => c?.departureLabel).filter(Boolean)))
    : [];
  if (boardDepartures.length) {
    out.push(`각 케이스 출발시각(${boardDepartures.join(' · ')}) 기준 Tmap 예측 교통을 반영한 소요시간이에요.`);
    // 일부 구간이 예측 실패로 호출시점 교통으로 대체됐으면 솔직히 알린다(여유가 과장될 수 있음).
    const fallbackCases = Array.isArray(acc.caseBoard?.cases)
      ? acc.caseBoard.cases.filter((c: any) => Number(c?.predictionFallbackSegments) > 0).length
      : 0;
    if (fallbackCases > 0) {
      out.push(`일부 케이스(${fallbackCases}개)는 예측 실패로 호출 시점 교통으로 대체된 구간이 있어 실제 정체가 덜 반영됐을 수 있어요.`);
    }
    out.push('유류할증은 과금시간 기반 초과거리에 포함했어요.');
  } else {
    out.push(
      departureAt
        ? `출발 시각 ${formatDepartureKST(departureAt)} 기준 소요시간이에요.`
        : '평일 오전 한산 시간대 기준 소요시간을 가정했어요.'
    );
    out.push('실시간 교통을 반영했고, 유류할증은 과금시간 기반 초과거리에 포함했어요.');
  }
  return out;
}

/**
 * 견적 신뢰도(배지)를 도구 산출물 신호로 산정한다. ConfidenceBadge가 기대하는 형태.
 * 경로 산출 실패면 무조건 low, 그 외 충족 신호 비율로 high/medium 구분.
 */
function buildConfidence(acc: CollectedOutputs, departureAt?: string) {
  const routeComputed = Boolean(acc.routeRequest) || Boolean(acc.scenarioComparison);
  const quoted = Boolean(acc.agentQuote) || Boolean(acc.scenarioComparison);
  const signals = [
    { ok: routeComputed, label: routeComputed ? '경로 거리·시간 산출 완료' : '경로 미산출(거리 추정)' },
    { ok: quoted, label: quoted ? '옹고잉 운임표 기반 요금 산출' : '요금 미산출' },
    {
      ok: Boolean(departureAt),
      label: departureAt ? '출발 시각 지정' : '출발 시각 미지정(평일 한산 가정)',
    },
    { ok: true, label: '실시간 교통 반영' },
  ];
  const score = Math.round((signals.filter((s) => s.ok).length / signals.length) * 100);
  const level: 'high' | 'medium' | 'low' = !routeComputed ? 'low' : score >= 75 ? 'high' : 'medium';
  return { level, score, signals };
}

/**
 * 후속 제안 칩(컴포저 상단). 결정적 UI 어포던스이며 사실(금액/거리)을 만들지 않는다.
 * 신뢰도 낮음(주소 저정밀/경로 미산출)이면 정확 주소 재입력을 최우선 제안한다.
 */
function buildSuggestedPrompts(acc: CollectedOutputs, confidenceLevel?: 'high' | 'medium' | 'low'): string[] {
  const out: string[] = [];
  if (confidenceLevel === 'low') {
    out.push('정확한 도로명 주소로 다시 견적 내줘');
  }
  if (acc.scenarioComparison) {
    out.push('가장 저렴한 시나리오로 PDF 만들어줘');
    out.push('출발시간대별 차이도 보여줘');
  } else if (acc.agentQuote) {
    out.push('스타렉스로도 비교해줘');
    out.push('출발시간대별로 비교해줘');
    out.push('정기 배송이면 월 견적은?');
  }
  if (acc.departureMatrix) {
    out.push('가장 빠른 출발 기준으로 확정해줘');
  }
  // 중복 제거 + 최대 4개.
  return Array.from(new Set(out)).slice(0, 4);
}

/** 사람이 읽을 수 있는 단계 라벨(진행 칩 표시용). */
const STEP_LABELS: Record<string, string> = {
  geocode_addresses: '주소 좌표 변환',
  optimize_route: '경로 최적화',
  compare_scenarios: '시나리오 비교 계산',
  quote_case_board: '케이스 보드 산출',
  calculate_quote: '견적 산출',
  forecast_route_timeline: '도착시각 타임라인',
  audit_delivery_timeline: '지연 진단 분석',
  validate_plan: '계획 점검',
  read_attachments: '첨부 문서 읽기',
  recall_recent_quotes: '과거 견적 조회',
  ask_user: '추가 질문 준비',
};

function sse(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = await request.json();
    const message: string = String(body?.message || '').trim();
    const sessionId: string | null = body?.sessionId ? String(body.sessionId) : null;
    const history: ChatHistoryItem[] = Array.isArray(body?.history) ? body.history : [];
    const departureAt: string | undefined = body?.departureAt ? String(body.departureAt) : undefined;
    const conversationContext = body?.conversationContext ?? null;
    const mapRouteContext = body?.mapRouteContext ?? null;
    const sessionSummary: string | null = body?.sessionSummary ? String(body.sessionSummary) : null;

    if (!message) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: '메시지가 비어 있습니다.' } },
        { status: 400 }
      );
    }

    const { model, provider, modelId } = resolveModel(body?.model);

    const trace: Array<{ tool: string; input: unknown; output: unknown }> = [];
    const tools = buildQuoteAgentTools({
      baseUrl: request.url,
      sessionId,
      departureAt,
      onToolEvent: (e) => {
        trace.push(e);
        void saveToolCallLog({ sessionId, tool: e.tool, input: e.input as any, output: e.output as any });
      },
    });

    const messages = [
      ...history
        .filter((h) => h.role === 'user' || h.role === 'assistant')
        .slice(-12)
        .map((h) => ({ role: h.role as 'user' | 'assistant', content: String(h.content || '') })),
      { role: 'user' as const, content: message },
    ];

    // 멀티턴 메모리: 직전 결과(차종/스케줄/주소/시나리오)를 컨텍스트로 주입.
    const contextNote = conversationContext
      ? `\n\n[직전 견적 컨텍스트 — 후속 요청 시 기본값으로 이어서 사용하고, 사용자가 바꾼 항목만 갱신하라]\n${JSON.stringify(conversationContext).slice(0, 1500)}`
      : '';

    // 지도 "이 경로로 견적": 지도에 이미 확정된 주소를 권위 있게 전달 → 재파싱/재지오코딩 훼손 방지.
    const mapRouteNote = mapRouteContext
      ? `\n\n[지도에 표시된 현재 경로 — 권위 있는 입력]\n사용자가 "지도에 표시된 경로 그대로" 견적을 요청했다. 아래 origin/stops 주소는 지도에서 이미 확정된 것이다. 이 주소 문자열을 토씨 하나 바꾸지 말고 그대로 optimize_route에 사용하라(상호명으로 재구성하거나 동/번지를 추가/삭제하지 마라). 메시지 본문에 주소가 축약(예: "서울 용산구")돼 있어도, 여기 stops의 정식 주소를 우선 사용하라. 역할(상차/배송/반납)은 사용자의 이전 맥락과 본문을 따르되, 주소는 이 목록을 신뢰하라.\n${JSON.stringify(mapRouteContext).slice(0, 1800)}`
      : '';

    // 장기 대화 요약: 최근 history 윈도우(8개) 밖의 맥락을 복원한다(세션 연속성).
    const summaryNote = sessionSummary
      ? `\n\n[이전 대화 요약 — 최근 메시지 밖의 맥락. 참고용이며, 현재 사용자 메시지/새 문서가 우선한다]\n${sessionSummary.slice(0, 1200)}`
      : '';

    const systemPrompt = SYSTEM_PROMPT + contextNote + mapRouteNote + summaryNote;

    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools,
      temperature: AGENT_DEFAULTS.temperature,
      stopWhen: stepCountIs(AGENT_DEFAULTS.maxSteps),
    });

    const acc: CollectedOutputs = {
      scenarioComparison: null,
      scenarioRouteErrors: [],
      scenarioRoutes: [],
      agentQuote: null,
      routeRequest: null,
      departureMatrix: null,
      auditTimeline: null,
      caseBoard: null,
      askedQuestion: null,
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => {
          try {
            controller.enqueue(sse(obj));
          } catch {
            /* 컨트롤러 종료 후 enqueue 무시 */
          }
        };

        // streamText 결과 1건을 소비하며 텍스트/도구이벤트를 클라이언트로 흘려보낸다.
        const consume = async (
          res: typeof result
        ): Promise<{ fullText: string; streamError: string | null }> => {
          let fullText = '';
          let streamError: string | null = null;
          try {
            for await (const part of res.fullStream) {
              switch (part.type) {
                case 'text-delta':
                  fullText += part.text;
                  send({ type: 'text', delta: part.text });
                  break;
                case 'tool-call':
                  send({ type: 'step', name: part.toolName, label: STEP_LABELS[part.toolName] || part.toolName, phase: 'start' });
                  break;
                case 'tool-result':
                  applyToolResult(acc, part.toolName, (part as any).output);
                  send({ type: 'step', name: part.toolName, label: STEP_LABELS[part.toolName] || part.toolName, phase: 'done' });
                  break;
                case 'tool-error':
                  send({ type: 'step', name: part.toolName, label: STEP_LABELS[part.toolName] || part.toolName, phase: 'error' });
                  break;
                case 'error':
                  streamError = String((part as any).error ?? 'stream error');
                  break;
                default:
                  break;
              }
            }
          } catch (err) {
            streamError = err instanceof Error ? err.message : String(err);
          }
          return { fullText, streamError };
        };

        const c1 = await consume(result);
        let fullText = c1.fullText;
        let streamError = c1.streamError;
        let finishReason = 'stop';
        let stepCount = 0;
        try {
          finishReason = await result.finishReason;
          stepCount = (await result.steps).length;
        } catch {
          /* 무시 */
        }

        // P1 stall 가드: 도구를 하나도 호출하지 않고 산출물도 없이 텍스트(예고)만 낸 경우,
        // 1회에 한해 "지금 도구를 호출하라"는 넛지로 재시도한다(빈 예고가 최종 답이 되는 것을 방지).
        const hasAnyOutput = () =>
          Boolean(acc.agentQuote || acc.scenarioComparison || acc.routeRequest || acc.departureMatrix || acc.caseBoard || acc.askedQuestion);
        const stalled = trace.length === 0 && !hasAnyOutput() && !streamError && Boolean(fullText);
        if (stalled) {
          send({ type: 'step', name: 'retry', label: '분석 이어서 진행', phase: 'start' });
          const nudge =
            '\n\n[시스템 지시 — 매우 중요] 방금 너는 예고만 하고 도구를 호출하지 않은 채 답을 끝냈다. 지금 즉시 필요한 도구(geocode_addresses / optimize_route / audit_delivery_timeline / compare_departure_times 등)를 호출해 실제 수치를 산출하고, 그 결과로만 결론을 작성하라. 다시 "~하겠습니다"라고만 답하지 마라.';
          const retryMessages = [
            ...messages,
            { role: 'assistant' as const, content: fullText },
            { role: 'user' as const, content: '예고만 하지 말고, 지금 도구를 호출해서 분석을 끝까지 진행해줘.' },
          ];
          const retry = streamText({
            model,
            system: systemPrompt + nudge,
            messages: retryMessages,
            tools,
            temperature: AGENT_DEFAULTS.temperature,
            stopWhen: stepCountIs(AGENT_DEFAULTS.maxSteps),
          });
          send({ type: 'text', delta: '\n\n' });
          const c2 = await consume(retry);
          send({ type: 'step', name: 'retry', label: '분석 이어서 진행', phase: c2.streamError ? 'error' : 'done' });
          fullText = `${fullText}\n\n${c2.fullText}`.trim();
          if (c2.streamError && !streamError) streamError = c2.streamError;
          try {
            finishReason = await retry.finishReason;
            stepCount += (await retry.steps).length;
          } catch {
            /* 무시 */
          }
        }

        const toolNames = trace.map((t) => t.tool);
        const succeeded = !streamError || Boolean(fullText);

        // 견적/시나리오가 산출된 경우에만 가정·신뢰도를 노출(질문만 한 턴 등에는 미노출).
        const hasQuoteOutput = Boolean(acc.agentQuote) || Boolean(acc.scenarioComparison) || Boolean(acc.caseBoard);
        const assumptions = hasQuoteOutput ? buildAssumptions(acc, departureAt) : [];
        const confidence = hasQuoteOutput ? buildConfidence(acc, departureAt) : undefined;
        // 재시도 후에도 도구 0건·산출물 0건이면(여전히 stall) 사용자가 막히지 않도록 재시도 칩을 제시.
        const stillStalled = trace.length === 0 && !hasAnyOutput();
        const suggestedPrompts = hasQuoteOutput
          ? buildSuggestedPrompts(acc, confidence?.level)
          : stillStalled
            ? ['최적 경로로 다시 분석해줘']
            : [];

        const finalPayload = {
          success: succeeded,
          assistantMessage: fullText,
          suggestedPrompts,
          quote: acc.agentQuote,
          scenarioComparison: acc.scenarioComparison,
          scenarioRouteErrors: acc.scenarioRouteErrors,
          scenarioRoutes: acc.scenarioRoutes,
          routeRequest: acc.routeRequest,
          departureMatrix: acc.departureMatrix,
          auditTimeline: acc.auditTimeline,
          caseBoard: acc.caseBoard,
          departureAt: departureAt ?? null,
          missingFields: acc.askedQuestion ? ['clarification'] : [],
          followUpQuestions: acc.askedQuestion ? [{ field: 'clarification', question: acc.askedQuestion }] : [],
          assumptions,
          confidence,
          error: succeeded
            ? undefined
            : { code: 'LLM_ERROR', message: '견적 에이전트 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.', details: streamError },
          pipeline: {
            mode: 'agent',
            provider,
            llmModel: modelId,
            steps: stepCount,
            toolCalls: toolNames,
            finishReason,
            elapsedMs: Date.now() - startedAt,
          },
          trace,
        };

        send({ type: 'final', payload: finalPayload });
        controller.close();

        // 대화 영속(베스트 에포트, 스트림 종료 후)
        if (sessionId && fullText) {
          try {
            const supabase = createServerClient();
            await supabase.from('quote_chat_messages').insert([
              { session_id: sessionId, role: 'user', content: message },
              {
                session_id: sessionId,
                role: 'assistant',
                content: fullText,
                metadata: {
                  kind: 'agent-response',
                  provider,
                  model: modelId,
                  steps: stepCount,
                  tools: toolNames,
                  hasScenarioComparison: Boolean(acc.scenarioComparison),
                  // 구조화 결과 영속 → 세션 재진입 시 카드/지도 복원.
                  structured: {
                    quote: acc.agentQuote ?? undefined,
                    scenarioComparison: acc.scenarioComparison ?? undefined,
                    scenarioRoutes: acc.scenarioRoutes?.length ? acc.scenarioRoutes : undefined,
                    scenarioRouteErrors: acc.scenarioRouteErrors?.length ? acc.scenarioRouteErrors : undefined,
                    routeRequest: acc.routeRequest ?? undefined,
                    departureMatrix: acc.departureMatrix ?? undefined,
                    auditTimeline: acc.auditTimeline ?? undefined,
                    caseBoard: acc.caseBoard ?? undefined,
                    departureAt: departureAt ?? undefined,
                    realtimeTraffic: true,
                    assumptions: assumptions.length ? assumptions : undefined,
                    confidence,
                  },
                },
              },
            ]);
          } catch {
            /* 영속 실패 무시 */
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'unknown';
    console.error('[agent-chat] 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: messageText.includes('ANTHROPIC') || messageText.includes('OPENAI') ? 'LLM_ERROR' : 'INTERNAL_ERROR',
          message: '견적 에이전트 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
          details: messageText,
        },
      },
      { status: 500 }
    );
  }
}
