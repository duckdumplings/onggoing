import type { ChatMessage } from './types';

export const createMessageId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const isSmallTalkMessage = (text?: string) => {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.length > 24) return false;
  if (normalized.length <= 3) return true;
  return /^(안녕|하이|ㅎㅇ|hello|hi|고마워|감사|응|네|ㅇㅋ|ok|오케이|잘가|굿모닝|좋은아침|반가워)[!~.\s?]*$/.test(normalized);
};

export const shouldRenderEvidence = (msg: ChatMessage) => {
  if (msg.role !== 'assistant') return false;
  if (!msg.evidence) return false;
  const hasEvidence = Boolean(msg.evidence.basis?.length || msg.evidence.sources?.length);
  if (!hasEvidence) return false;
  if (isSmallTalkMessage(msg.sourceUserText)) return false;
  if (msg.kind === 'system') return false;
  return true;
};

export const getDomainFromUrl = (url?: string) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

export const normalizeAddressForPreview = (address: string) =>
  String(address || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^서울시\s+/, '서울특별시 ')
    .replace(/(\d+)\s*충/g, '$1층')
    .replace(/(로|길|대로)(\d)/g, '$1 $2')
    .replace(/(로)\s*(\d+)\s*가길\s*(\d+)/g, '$1$2가길 $3')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/(?:지하\s*)?\d+\s*(?:층|충)/g, ' ')
    .replace(/\d+\s*호/g, ' ')
    .replace(/\d+\s*동/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const sanitizeRequestDataForPreview = (requestData: any) => {
  const origin = requestData?.origins?.[0] ? normalizeAddressForPreview(String(requestData.origins[0])) : '';
  const destinations = Array.isArray(requestData?.destinations)
    ? requestData.destinations.map((d: string) => normalizeAddressForPreview(String(d)))
    : [];
  return {
    ...requestData,
    origins: origin ? [origin] : [],
    destinations,
    finalDestinationAddress: destinations.length ? destinations[destinations.length - 1] : null,
  };
};

export const WELCOME_MESSAGE =
  '안녕하세요! 배송 견적을 도와드릴까요?\n출발지, 목적지, 차량, 시간 정보를 편하게 말씀해 주세요.';
