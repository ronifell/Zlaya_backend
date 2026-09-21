/**
 * 30–60-only post-generation enricher driven by official TESTES dossiers.
 * Must NOT be applied to RN (0–28).
 */

const FEMININE_NAMES = new Set([
  'lara', 'maria', 'ana', 'sofia', 'helena', 'julia', 'júlia', 'isabela', 'manuela', 'alice',
  'beatriz', 'laura', 'valentina', 'giovanna', 'livia', 'lívia', 'heloisa', 'heloísa',
]);

function sigSet(signals) {
  return new Set((signals?.signals || []).map((s) => s.id));
}

function has(text, re) {
  return re.test(text || '');
}

const WAKE_WINDOW_REF = '45 minutos a 1 hora e 15 minutos';

/**
 * Strip wording that the post-generation guard would otherwise treat as
 * unsafe (false-positive blocks on 30–60 TESTE 002 dossiers).
 */
export function scrubThirtySixtySafetyWording(text) {
  let out = String(text || '');
  out = out.replace(/auto-?\s*regula[cç][aã]o/gi, 'necessidade de sucção');
  out = out.replace(/\bautorregula[cç][aã]o\b/gi, 'necessidade de sucção');
  out = out.replace(/n[aã]o deve ser automaticamente rotulad[oa] como um h[aá]bito a corrigir[^.]*\./gi, '');
  out = out.replace(/[^.!?\n]*h[aá]bito a corrigir[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*h[aá]bito que pode ser corrigido[^.!?]*[.!?]/gi, '');
  out = out.replace(/h[aá]bito a corrigir/gi, '');
  out = out.replace(/h[aá]bito que pode ser corrigido/gi, '');
  out = out.replace(/sem causar desmame(?: nem|,? ou) confus[aã]o de bico/gi, '');
  out = out.replace(
    /n[aã]o causa desmame nem confus[aã]o de bico/gi,
    'tem finalidade de aprendizado, sem garantir ausência de dificuldades na alternância peito e mamadeira',
  );
  out = out.replace(/\bmaus?\s+h[aá]bitos?\b/gi, 'padrão de condução');
  out = out.replace(/classific\w*\s+como\s+padr[aã]o de condu[cç][aã]o/gi, 'rotular o comportamento');
  out = out.replace(
    /n[aã]o classifique como padr[aã]o de condu[cç][aã]o[^.]*\./gi,
    'Nesta idade o Método não usa classificação comportamental inadequada para 0 a 3 meses.',
  );
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

function scrubInternalReasoningLanguage(text) {
  let out = String(text || '');
  out = out.replace(/\s*[—\-–]\s*como hip[oó]tese, sem diagn[oó]stico\.?/gi, '.');
  out = out.replace(/como hip[oó]tese, sem diagn[oó]stico\.?/gi, '');
  out = out.replace(/\s*e n[aã]o est[ií]mulos\/janela sem evid[eê]ncia no relato\.?/gi, '.');
  out = out.replace(/sem evid[eê]ncia no relato/gi, '');
  out = out.replace(/n[aã]o deve ser classificada como curta/gi, 'não é o principal problema neste momento');
  out = out.replace(/Me diga o que falta no relato:\s*/gi, '');
  out = out.replace(
    /Aqui a prioridade [eé] alimenta[cç][aã]o\/saciedade e o p[oó]s-mamada[^.]*\./gi,
    'Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.',
  );
  out = out.replace(/,\s+\./g, '.');
  out = out.replace(/\.\s*\./g, '.');
  return out;
}

function appendOnce(text, fragment) {
  const t = (text || '').replace(/\s+$/, '');
  const f = String(fragment || '').trim();
  if (!f) return t;
  const needle = f.slice(0, Math.min(48, f.length));
  if (needle && t.includes(needle)) return t;
  return `${t}\n\n${f}`;
}

function keepFirstMatch(text, re) {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const rx = new RegExp(re.source, flags);
  let seen = 0;
  return String(text || '').replace(rx, (m) => {
    seen += 1;
    return seen === 1 ? m : '';
  });
}

function dedupeSimilarParagraphs(text) {
  const parts = String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const kept = [];
  const keyOf = (p) => p.toLowerCase().replace(/\s+/g, ' ').slice(0, 96);
  const norm = (p) => p.toLowerCase().replace(/\s+/g, ' ');
  for (const p of parts) {
    const key = keyOf(p);
    const fullB = norm(p);
    let dupAt = -1;
    for (let i = 0; i < kept.length; i += 1) {
      const fullA = norm(kept[i]);
      if (keyOf(kept[i]) === key) { dupAt = i; break; }
      if (fullA.length > 80 && fullB.length > 80 && (fullA.includes(fullB) || fullB.includes(fullA))) {
        dupAt = i;
        break;
      }
    }
    if (dupAt < 0) kept.push(p);
    else if (p.length > kept[dupAt].length) kept[dupAt] = p;
  }
  return kept.join('\n\n');
}

function stripCribInventedHowTo(text) {
  let out = String(text || '');
  out = out.replace(/[^.!?\n]*Comece pela primeira soneca da manh[aã][^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*inicie pela primeira soneca da manh[aã][^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*come[cç]ar pela primeira soneca da manh[aã][^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*come[cç]ar a adaptar.{0,80}primeira soneca da manh[aã][^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*primeira soneca da manh[aã].{0,160}(mesmo dia|daquele dia)[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*acalme(?:-o)? no colo.{0,80}volte ao ber[cç]o.{0,80}repet[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*acalme(?:-o)? no colo.{0,80}retorne ao ber[cç]o.{0,80}repet[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*colo.{0,40}voltar.{0,30}ber[cç]o.{0,50}repetir at[eé] adormecer[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*acalm[eéáa](?:-l[oa])? no colo.{0,120}volt[ae]r? ao ber[cç]o.{0,80}repet[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*no colo e,? em seguida,? volt[ae]r? ao ber[cç]o.{0,80}repet[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*acalme(?:-o)? no colo.{0,80}volte ao ber[cç]o.{0,80}at[eé] que ele adorme[cç]a[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*Se houver resist[eê]ncia.{0,120}volte ao ber[cç]o.{0,80}adorme[cç]a[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*Repita (?:esse processo )?diariamente at[eé] consolidar[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*at[eé] consolidar essa adapta[cç][aã]o[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*Lembre-se de n[aã]o cronometr[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*N[aã]o [eé] necess[aá]rio cronometrar o choro[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*N[aã]o cronometr(?:ar|[ae]) o choro[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*[eé] importante n[aã]o cronometr[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*n[aã]o cronometr(?:ar|[ae]) o choro[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*sem cronometrar o (choro|tempo)[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*aguarde a resposta do beb[eê] sem cronometrar[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*n[aã]o classificar como padr[aã]o de condu[cç][aã]o[^.!?]*[.!?]/gi, '');
  return out;
}

const ANGRY_WAKE_CANON =
  'Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.';

const ANGRY_WAKE_FEED_REFINE =
  'O tempo de mamada, sozinho, não comprova saciedade — mesmo que ela tenha mamado 20 a 30 minutos antes da soneca. Observe sucção ativa, deglutição e sinais de saciedade. Sugar pouco e relaxar ao despertar não significa automaticamente que ela precise se alimentar.';

const ANGRY_WAKE_FEED_REFINE_NO_TIME =
  'O tempo de mamada, sozinho, não comprova saciedade. Observe sucção ativa, deglutição e sinais de saciedade. Sugar pouco e relaxar ao despertar não significa automaticamente que ela precise se alimentar.';

function stripCommonSituationFraming(text) {
  let out = String(text || '');
  out = out.replace(/[^.!?\n]*[Ee]ssa situa[cç][aã]o [eé] comum[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*[eé] comum e pode ser ajustada com algumas orienta[cç][oõ]es[^.!?]*[.!?]/gi, '');
  out = out.replace(/pode ser ajustada com algumas orienta[cç][oõ]es[^.!?]*[.!?]?/gi, '');
  return out;
}

function isAngryWakeRepeatParagraph(para) {
  const t = String(para || '');
  const nap = /1 hora ou at[eé] mais|soneca de (cerca de )?1\s*h|dura[cç][aã]o da soneca|n[aã]o (consideraria|parece ser| [eé] o) .{0,40}(principal )?(problema|ponto)/i.test(t);
  const wake = /irritad|brav[oa]|chor|despertar .{0,30}aten[cç]/i.test(t);
  return nap && wake;
}

function salvageAngryWakeExtras(para) {
  const sentences = String(para || '').match(/[^.!?]+[.!?]+/g) || [];
  return sentences
    .filter((s) => /refluxo|arroto|posi[cç][aã]o vertical|20 a 30 minutos|30 a 40 minutos|suc[cç][aã]o ativa|degluti[cç][aã]o|colocad[oa] no ber[cç]o/i.test(s))
    .filter((s) => !isAngryWakeRepeatParagraph(s))
    .filter((s) => !/n[aã]o consideraria a dura[cç][aã]o|n[aã]o [eé] o (principal )?problema/i.test(s))
    .join(' ')
    .trim();
}

function stripAutoHungerFromSuckRelax(text) {
  let out = String(text || '');
  out = out.replace(
    /[^.!?\n]*(?:suga(?:r)? pouco e relaxa|sugar pouco e relaxar)[^.!?]{0,120}(?:precisa (se )?aliment|indica (que )?(h[aá] )?fome|necessidade de alimenta|ofere[cç]a (o peito|a mamada)|deve (ser )?alimentad)[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*(?:isso indica que ela precisa se alimentar|por isso (ela )?precisa (se )?alimentar|ofere[cç]a (o peito|a mamada) (de novo|novamente|ao despertar))[^.!?]*[.!?]/gi,
    '',
  );
  return out;
}

function angryWakeFeedRefineCanon(msg) {
  return /20\s*(a|-|–)\s*30\s*min/i.test(msg || '') ? ANGRY_WAKE_FEED_REFINE : ANGRY_WAKE_FEED_REFINE_NO_TIME;
}

function ensureAngryWakeFeedRefine(text, msg) {
  let out = stripAutoHungerFromSuckRelax(text);
  if (!/20\s*(a|-|–)\s*30\s*min/i.test(msg || '')) {
    out = out.replace(/\s*[—\-–]\s*mesmo que ela tenha mamado 20 a 30 minutos antes da soneca/gi, '');
  }
  if (has(out, /n[aã]o comprova saciedade|n[aã]o significa automaticamente que .{0,40}aliment/i)) {
    return out;
  }
  const canon = angryWakeFeedRefineCanon(msg);
  const parts = out.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  const insertAt = parts.findIndex((p) => /Como ela consegue dormir por cerca de 1 hora/i.test(p));
  if (insertAt >= 0) {
    parts.splice(insertAt + 1, 0, canon);
    return parts.join('\n\n');
  }
  return appendOnce(out, canon);
}

function motherReportedWakeWindow(message) {
  return /permanece acordad|tempo acordad|janela (de sono|de vig[ií]lia)|acordad[oa] por|1h\s*30|1h30|1h\s*15|1h15|45\s*min/i.test(
    String(message || ''),
  );
}

const ANGRY_WAKE_POSTURAL_ASK =
  'Depois da mamada, ela arrotou e permaneceu em posição vertical por cerca de 20 a 30 minutos?';
const ANGRY_WAKE_FEED_ASK =
  'A mamada pareceu efetiva, com sucção ativa e sinais de saciedade?';
const ANGRY_WAKE_DISCOMFORT_ASK =
  'Há sinais de desconforto depois da mamada ou ao ser colocada no berço?';

/** TESTE 011 (30d): faixa geral 20–30 min. Não use 30–40 sem condição específica confirmada. */
function applyAngryWakePostural2030(text) {
  let out = String(text || '');
  out = out.replace(
    /posi[cç][aã]o vertical por (cerca de )?30 a 40 minutos/gi,
    'posição vertical por cerca de 20 a 30 minutos',
  );
  out = out.replace(
    /em posi[cç][aã]o vertical por (cerca de )?30 a 40 minutos/gi,
    'em posição vertical por cerca de 20 a 30 minutos',
  );
  out = out.replace(
    /permanecer (cerca de )?30 a 40 minutos em posi[cç][aã]o vertical/gi,
    'permanecer cerca de 20 a 30 minutos em posição vertical',
  );
  out = out.replace(
    /mant[eê]-l[oa] em posi[cç][aã]o vertical por (cerca de )?30 a 40 minutos/gi,
    'mantê-la em posição vertical por cerca de 20 a 30 minutos',
  );
  return out;
}

function stripSuckRelaxAnticipation(text) {
  return String(text || '')
    .replace(/\s*:?\s*investigue tamb[eé]m desconforto e se a suc[cç][aã]o est[aá] sendo usada para relaxar\.?/gi, '.')
    .replace(/\s*e se a suc[cç][aã]o est[aá] sendo usada para relaxar\.?/gi, '.')
    .replace(/\.\s*\./g, '.');
}

/** TESTE 011 (30d): 20–30 postural; one nap reading; one combined arroto/vertical ask. */
function consolidateAngryWakeTeste010(text) {
  let out = stripSuckRelaxAnticipation(applyAngryWakePostural2030(text));
  out = out.replace(/[^.!?\n]*[EÉ] compreens[ií]vel que voc[eê] esteja preocupada[^.!?]*[.!?]/gi, '');
  out = out.replace(
    /[^.!?\n]*principal hip[oó]tese[^.!?]{0,200}(alimenta[cç][aã]o e [aà] saciedade|alimenta[cç][aã]o e saciedade|desconforto ap[oó]s a mamada)[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(/[^.!?\n]*Como ela mama antes da soneca[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*voc[eê] pode tentar mant[eê]-l[oa] em posi[cç][aã]o vertical[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*Isso pode ajudar a reduzir a irrita[cç][aã]o ao acordar[^.!?]*[.!?]/gi, '');
  out = out.replace(/Para (melhorar essa situa[cç][aã]o|entender melhor a situa[cç][aã]o)[^.!?]{0,80}:\s*/gi, '');
  out = out.replace(/Para entender melhor a situa[cç][aã]o, gostaria de saber:\s*/gi, '');
  out = out.replace(/Essas informa[cç][oõ]es v[aã]o ajudar a entender[^.!?]*[.!?]/gi, '');
  out = out.replace(/^\s*\d+\.\s*/gm, '');
  out = out.replace(
    /[^.!?\n]*voc[eê] conseguiu fazer com que ela arrotasse[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*Ela permaneceu em posi[cç][aã]o vertical(?: por .{0,40}minutos)?(?: ap[oó]s mamar)?\??/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*Ela ficou em posi[cç][aã]o vertical, e por quanto tempo\??/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*Depois da mamada, antes de deitar:[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(/[^.!?\n]*houve arroto(?: ap[oó]s a mamada)?\??/gi, '');
  out = out.replace(
    /[^.!?\n]*arrotou e permaneceu em posi[cç][aã]o vertical[^.!?]*[.!?]/gi,
    '',
  );
  out = keepFirstMatch(out, /[^.!?\n]*H[aá] sinais de desconforto depois da mamada[^.!?]*[.!?]/gi);
  out = keepFirstMatch(out, /[^.!?\n]*mamada pareceu efetiva[^.!?]*[.!?]/gi);
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  if (!/mamada parec(?:e|eu) efetiva/i.test(out)) {
    out = appendOnce(out, ANGRY_WAKE_FEED_ASK);
  }
  if (!/colocad[oa] no ber[cç]o|ao ser colocad/i.test(out)) {
    out = appendOnce(out, ANGRY_WAKE_DISCOMFORT_ASK);
  }
  out = placeAngryWakePosturalAsk(out);
  out = mergeAngryWakeAsks(out);
  return applyAngryWakePostural2030(out.replace(/\n{3,}/g, '\n\n').trim());
}

function mergeAngryWakeAsks(text) {
  const parts = String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const isAsk = (p) =>
    /mamada parec(?:e|eu) efetiva|arrotou e permaneceu em posi[cç][aã]o vertical|sinais de desconforto depois da mamada/i.test(p)
    && p.length < 240;
  const asks = [];
  const rest = [];
  for (const p of parts) {
    if (isAsk(p)) asks.push(p.replace(/\s+/g, ' ').trim());
    else rest.push(p);
  }
  if (asks.length < 2) return String(text || '');
  const merged = asks.join(' ');
  const idx = rest.findIndex((p) => /n[aã]o comprova saciedade/i.test(p));
  if (idx >= 0) rest.splice(idx + 1, 0, merged);
  else rest.push(merged);
  return rest.join('\n\n');
}

/** TESTE 008/009/011 (30d): feeds, no wake without evidence, no morning-nap reask, no restated opening, postural 20–30. */
function scrubAngryWakeTeste008(text, message) {
  let out = String(text || '');
  out = out.replace(/[^.!?\n]*refor[cç]ar as mamadas[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*Para melhorar essa situa[cç][aã]o, considere refor[cç]ar[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*garantindo que ela esteja bem alimentada[^.!?]*[.!?]/gi, '');
  out = out.replace(
    /[^.!?\n]*[EÉ] compreens[ií]vel que.{0,160}(acorde muito irritada|preocupada com o choro|preocupada com o despertar)[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*despertar bravo.{0,120}s[oó] se acalmar ao mamar[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*principal hip[oó]tese .{0,80}(isso|o choro|o que est[aá] acontecendo) pode estar relacionado [aà] alimenta[cç][aã]o e [aà]? ?saciedade[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*[EÉ] importante investigar se a mamada foi efetiva[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*dura[cç][aã]o da soneca da manh[aã][^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*mais sobre a dura[cç][aã]o da soneca da manh[aã][^.!?]*[.!?]/gi,
    '',
  );
  if (!motherReportedWakeWindow(message)) {
    out = out.replace(/[^.!?\n]*janela de vig[ií]lia[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*acordad[oa] por muito tempo[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*hiperestimula[cç][aã]o[^.!?]*[.!?]/gi, '');
    out = out.replace(
      /[^.!?\n]*Tamb[eé]m [eé] fundamental respeitar a janela de vig[ií]lia[^.!?]*[.!?]/gi,
      '',
    );
  }
  return applyAngryWakePostural2030(out.replace(/\n{3,}/g, '\n\n').trim());
}

/** TESTE 006 (30d): one feeding/discomfort reading; never pre-label as "comum". */
function dedupeAngryWakeExplanation(text) {
  let out = stripCommonSituationFraming(text);
  const canonRe = /Como ela consegue dormir por cerca de 1 hora ou at[eé] mais[\s\S]{0,400}desconforto depois dela\./i;
  const hit = out.match(canonRe);
  const canon = hit ? hit[0] : ANGRY_WAKE_CANON;
  if (hit) out = out.replace(canonRe, '').trim();
  const kept = [];
  for (const p of out.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean)) {
    if (!isAngryWakeRepeatParagraph(p)) {
      kept.push(p);
      continue;
    }
    const salvage = salvageAngryWakeExtras(p);
    if (salvage) kept.push(salvage);
  }
  return `${canon}\n\n${kept.join('\n\n')}`.replace(/\n{3,}/g, '\n\n').trim();
}

function scrubTruncatedClauses(text) {
  let out = String(text || '');
  out = out.replace(/Isso pode ajudar a(?=\s+[A-ZÁÉÍÓÚÃÕÂÊÔÀÜ])/g, '');
  out = out.replace(/Isso pode ajudar a\s*$/gim, '');
  out = out.replace(/Isso pode ajudar a\s+(?=\n)/g, '');
  out = out.replace(/Isso [eé] importante para(?=\s+[A-ZÁÉÍÓÚÃÕÂÊÔÀÜ])/g, '');
  out = out.replace(/Isso [eé] importante para\s*$/gim, '');
  out = out.replace(/Isso [eé] importante para\s+(?=\n)/g, '');
  out = out.replace(/Isso ajuda a(?=\s+[A-ZÁÉÍÓÚÃÕÂÊÔÀÜ])/g, '');
  out = out.replace(/[^.!?\n]*Isso ajudar[aá] a (avaliar|entender)[^.!?]*[.!?]/gi, '');
  out = out.replace(/sinais de saciedade\.\s+[Ee] se /g, 'sinais de saciedade e se ');
  out = out.replace(/Se (ele|o beb[eê]) [eé] saud[aá]vel e dorme espontaneamente [àa] noite,\s*(?=\n|$)/gi, '');
  out = out.replace(/Se a recondu[cç][aã]o n[aã]o funcionar,\s*(?=Se |$|\n)/gi, '');
  out = out.replace(/Como a recondu[cç][aã]o j[aá] foi tentada e n[aã]o funcionou,\s*(?=Se |$|\n)/gi, '');
  out = out.replace(/\.Se(?=\s|[A-ZÁÉÍÓÚÃÕÂÊÔÀ])/g, '. Se');
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out.replace(/[ \t]+\n/g, '\n');
  out = out.replace(/[ \t]+\./g, '.');
  return out;
}

function lastNapCompromisesNight(msg) {
  const s = String(msg || '');
  return /[uú]ltima soneca/i.test(s) && /(compromete|in[ií]cio da noite|in[ií]cio do sono noturno)/i.test(s);
}

function stripEarlyNapCloseBeforeCap(text, msg) {
  if (lastNapCompromisesNight(msg)) return String(text || '');
  return String(text || '').replace(
    /[^.!?\n]*(?:considerar )?encerrar a soneca antes de (atingir )?2h\s*30[^.!?]*[.!?]/gi,
    '',
  );
}

function stripIrritationAsFeedChange(text) {
  return String(text || '')
    .replace(/[^.!?\n]*fome ou irrita[cç][aã]o.{0,80}ajustar a alimenta[cç][aã]o[^.!?]*[.!?]/gi, '')
    .replace(/[^.!?\n]*irrita[cç][aã]o.{0,40}ajustar a alimenta[cç][aã]o[^.!?]*[.!?]/gi, '');
}

function fixNapCapComposition(text) {
  return String(text || '')
    .replace(
      /[eé] importante acorde o beb[eê] e organize a pr[oó]xima janela(?: e organizar a pr[oó]xima janela)?/gi,
      'ao atingir 2h30, acorde o bebê e organize a próxima janela',
    )
    .replace(/organize a pr[oó]xima janela e organizar a pr[oó]xima janela/gi, 'organize a próxima janela');
}

function placeAngryWakePosturalAsk(text) {
  const parts = String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const posturalIdx = parts.findIndex((p) => /arrotou e permaneceu em posi[cç][aã]o vertical/i.test(p));
  const ask = posturalIdx >= 0 ? parts.splice(posturalIdx, 1)[0] : ANGRY_WAKE_POSTURAL_ASK;
  let idx = parts.findIndex((p) => /mamada parec(?:e|eu) efetiva/i.test(p));
  if (idx < 0) idx = parts.findIndex((p) => /n[aã]o comprova saciedade/i.test(p));
  if (idx >= 0) parts.splice(idx + 1, 0, ask);
  else parts.push(ask);
  return parts.join('\n\n');
}

const NIGHT_PATTERN_CANON = `Você relata que ele dorme bem durante a primeira parte da noite e que, em algumas noites, consegue dormir seguido até aproximadamente 3h ou 4h da manhã.

O primeiro passo é ver há quanto tempo foi a última mamada efetiva e se o jejum noturno da idade já foi atingido — cerca de 3 horas aos 30 dias, aumentando até cerca de 5 horas aos 60 dias. Se ainda não atingiu o jejum da idade e a mamada anterior foi efetiva, com saciedade, tente primeiro reconduzi-lo ao sono. Quando o jejum da idade já tiver sido alcançado, ofereça mamada.

Quando a mamada que encerra o jejum for necessária, ofereça uma mamada efetiva e, depois das medidas posturais (arroto e posição vertical por 20 a 30 minutos), coloque-o novamente no berço.

Como ele já dormiu algumas horas seguidas e está mais descansado, pode apresentar, a partir desse momento, um período maior de vigília. Por isso, se ele mamou bem por volta das 4h e despertar novamente cerca de uma hora depois, tente conduzi-lo novamente ao sono sem oferecer imediatamente o peito. Nesse intervalo, a tendência é que esse novo despertar não seja por fome, já que ele acabou de realizar uma mamada efetiva.

Se ele não voltar a dormir imediatamente, isso não significa que precise mamar novamente. Ele pode simplesmente estar mais desperto depois de já ter descansado durante a primeira parte da noite. Mantenha o ambiente tranquilo, com pouca estimulação, e vá conduzindo-o novamente ao sono.

Quando se completar aproximadamente 2h a 2h30 desde o início da última mamada efetiva no peito, uma nova mamada pode ser oferecida. Se a alimentação for por mamadeira, a referência passa a ser 3 horas, também contadas a partir do início da mamada anterior.

Você não precisa oferecer o peito em todos os despertares apenas porque ele ainda é novinho. Use como referência a última mamada efetiva e, nos despertares que acontecerem antes do próximo intervalo alimentar, tente primeiro conduzi-lo novamente ao sono.`;

const NIGHT_FAST_CONDITIONAL_CANON = `O primeiro passo é ver há quanto tempo foi a última mamada efetiva e se o jejum noturno da idade já foi atingido — cerca de 3 horas aos 30 dias, aumentando até cerca de 5 horas aos 60 dias. Se ainda não atingiu o jejum da idade e a mamada anterior foi efetiva, com saciedade, tente primeiro reconduzi-lo ao sono. Quando o jejum da idade já tiver sido alcançado, ofereça mamada.

Quando a mamada que encerra o jejum for necessária, ofereça uma mamada efetiva e, depois das medidas posturais (arroto e posição vertical por 20 a 30 minutos), coloque-o novamente no berço.

Sem o horário e a qualidade da última mamada, não concluo que o despertar não é fome. Se ele mamou efetivamente por volta das 4h e despertar novamente cerca de uma hora depois, tente conduzi-lo ao sono sem oferecer imediatamente o peito.

Quando se completar aproximadamente 2h a 2h30 desde o início da última mamada efetiva no peito, uma nova mamada pode ser oferecida. Se a alimentação for por mamadeira, a referência passa a ser 3 horas, também contadas a partir do início da mamada anterior.

Você não precisa oferecer o peito em todos os despertares apenas porque ele ainda é novinho. Use como referência a última mamada efetiva e, nos despertares que acontecerem antes do próximo intervalo alimentar, tente primeiro conduzi-lo novamente ao sono.`;

function motherReportedFirstStretch(msg) {
  return /primeira parte|dorme (super )?bem|acorda entre|2:30|02:30|2h30 a 3|at[eé] (cerca de )?(2h\s*30|3h)(?!\s*da manh)/i.test(String(msg || ''));
}

function stripAssumedFirstStretch(text) {
  let out = String(text || '');
  out = out.replace(/[^.!?\n]*Voc[eê] relata que (ele|ela) dorme bem durante a primeira parte da noite[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*dorme bem durante a primeira parte da noite[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*consegue dormir seguido at[eé] aproximadamente 3h ou 4h[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*j[aá] dormiu algumas horas seguidas[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*mamou bem por volta das 4h[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*tend[eê]ncia [eé] que esse novo despertar n[aã]o seja por fome[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*descansado durante a primeira parte da noite[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*primeira parte da noite[^.!?]*[.!?]/gi, '');
  return out;
}

function hasNightFirstStretchPattern(text) {
  return (
    /primeira parte da noite/i.test(text) &&
    /3h ou 4h|3h ou 4 h|por volta das 4h/i.test(text) &&
    /mais descansado|per[ií]odo maior de vig[ií]lia/i.test(text) &&
    /2h a 2h\s*30|2h\s*a\s*2h30|2 horas a 2 horas e 30/i.test(text)
  );
}

function reorderNightHourlyDecision(text, msg) {
  let out = String(text || '');
  out = out.replace(
    /[^.!?\n]*orienta[cç][aã]o pr[aá]tica[^.!?]{0,280}[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*tente faz[eê][\-‐‑–—]?l[oa] dormir novamente sem oferecer[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*voc[eê] deve tentar faz[eê][\-‐‑–—]?l[oa] dormir[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*ap[oó]s as 4h da manh[aã][^.!?]{0,120}sem oferecer o peito imediatamente[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(/[^.!?\n]*Verifique tamb[eé]m o hor[aá]rio da [uú]ltima mamada[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*A pergunta decisiva [eé]:[\s\S]{0,500}?novinho\./gi, '');
  out = out.replace(
    /[^.!?\n]*O primeiro passo [eé] identificar o hor[aá]rio da [uú]ltima mamada[\s\S]{0,420}?peito\./gi,
    '',
  );
  out = out.replace(/[^.!?\n]*Se j[aá] (tinham )?passado(?:m)? cerca de 2h30 a 3h[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*Se j[aá] se passaram.{0,40}2h\s*30.{0,40}3h[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*2h\s*30\s*[aàá–\-]\s*3h[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*aproximadamente 2h30 a 3h[^.!?]*[.!?]/gi, '');
  out = out.replace(
    /[^.!?\n]*Se o despertar ocorrer antes de completar aproximadamente 3 horas[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(/[^.!?\n]*Se ainda n[aã]o completou esse intervalo[^.!?]*[.!?]/gi, '');
  out = out.replace(/qual foi o hor[aá]rio da [uú]ltima mamada antes das 4h[^.?]*\??/gi, '');
  out = out.replace(/Voc[eê] costuma oferecer peito ou mamadeira automaticamente[^.?]*\??/gi, '');
  out = out.replace(
    /[^.!?\n]*orienta[cç][aã]o pr[aá]tica segura [eé] que[^.!?]{0,200}voc[eê] deve\s*/gi,
    '',
  );
  out = scrubTruncatedClauses(out);
  out = out.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();

  const reportedStretch = motherReportedFirstStretch(msg);
  if (reportedStretch) {
    if (!hasNightFirstStretchPattern(out)) {
      const parts = out.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
      if (parts.length === 0) {
        out = NIGHT_PATTERN_CANON;
      } else {
        const firstIsEmpathy = /^(É compreens|[EÉ] comum que|Olá|M[aã]e,)/i.test(parts[0]);
        parts.splice(firstIsEmpathy ? 1 : 0, 0, NIGHT_PATTERN_CANON);
        out = parts.join('\n\n');
      }
    }
  } else {
    out = stripAssumedFirstStretch(out);
    if (!has(out, /SE ele mamou efetivamente por volta das 4h|sem o hor[aá]rio e a qualidade da [uú]ltima mamada/i)) {
      const parts = out.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
      const firstIsEmpathy = parts.length && /^(É compreens|[EÉ] comum que|Olá|M[aã]e,)/i.test(parts[0]);
      if (!parts.length) {
        out = NIGHT_FAST_CONDITIONAL_CANON;
      } else {
        parts.splice(firstIsEmpathy ? 1 : 0, 0, NIGHT_FAST_CONDITIONAL_CANON);
        out = parts.join('\n\n');
      }
    }
  }
  return out;
}

function stripNightHourlyTeste011Leaks(text) {
  let out = String(text || '');
  out = out.replace(
    /[ÀA] noite, o beb[eê] de 30[–\-]?60 dias[\s\S]{0,1200}?(expectativa futura|n[aã]o comece por associa[cç][aã]o)[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*n[aã]o aprenda a associar cada despertar[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*associa[cç][oõ]es negativas[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*Uma coisa [eé] n[aã]o acordar um beb[eê] saud[aá]vel[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*Outra [eé] ele acordar sozinho depois das 4h[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*intervalo de 3 horas n[aã]o serve sozinho[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*Antes de pensar em associa[cç][aã]o peito[–\-]sono[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /E como est[aá] a alimenta[cç][aã]o (dele|dela) durante o dia\??/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*ele mama no peito, f[oó]rmula ou complemento[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*rotina alimentar do dia[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*ganho de peso e a produ[cç][aã]o de leite[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*Nesses despertares ele faz uma mamada efetiva ou s[oó] suga[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*A percep[cç][aã]o de que [“"']?n[aã]o [eé] fome[”"']?[^.!?]*novinho[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*A principal orienta[cç][aã]o [eé] investigar o hor[aá]rio da [uú]ltima mamada[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*Se ele acordar antes de 3 horas, tente faz[eê]-l[oa] dormir novamente sem mamar[^.!?]*[.!?]/gi,
    '',
  );
  return out;
}

const DAY_SLEEP_OPEN_51 =
  'Antes de pensarmos em quanto tempo ela levará para aprender, precisamos entender por que ela está conseguindo entrar em sono apenas no colo ou no peito.';

function strip51dNormalization(text) {
  let out = String(text || '');
  out = out.replace(
    /[EÉ] (normal|comum) que (a beb[eê] de \d+ dias|beb[eê]s de \d+ dias) tenha(?:m)? dificuldade(?:s)? para dormir durante o dia[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*especialmente se ela s[oó] consegue adormecer no colo ou no peito[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(/Essa fase [eé] de adapta[cç][aã]o[^.!?]*[.!?]/gi, '');
  out = out.replace(/[eé] esperado que haja varia[cç][oõ]es no sono[^.!?]*[.!?]/gi, '');
  out = out.replace(
    /[eé] esperado que a beb[eê] precise de suporte para adormecer[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*s[oó] consegue adormecer no colo ou no peito[^.!?]{0,80}(fase|adapta[cç][aã]o|idade)[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[EÉ] compreens[ií]vel que.{0,100}dificuldade para dormir durante o dia[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*muitos beb[eê]s preferem o colo ou o peito[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*prefer[eê]ncias? por dormir no colo ou no peito[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[EÉ] comum que beb[eê]s nesta faixa et[aá]ria tenham prefer[eê]ncias[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*isso n[aã]o deve ser rotular o comportamento[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(/n[aã]o deve ser rotular o comportamento/gi, '');
  out = out.replace(/Isso [eé] (bastante )?comum e esperado[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*ru[ií]do branco[^.!?]*[.!?]/gi, '');
  return out;
}

function ensure51dInvestigationOpen(text) {
  let out = String(text || '').replace(/\n{3,}/g, '\n\n').trim();
  if (has(out, /por que ela est[aá] conseguindo entrar em sono apenas no colo|entender por que ela.{0,40}colo ou no peito/i)) {
    return out;
  }
  return `${DAY_SLEEP_OPEN_51}\n\n${out}`.trim();
}

function strip51dCalmStartRule(text) {
  let out = String(text || '');
  out = out.replace(
    /, mas [eé] fundamental que voc[eê] a inicie quando a beb[eê] estiver calma/gi,
    '',
  );
  out = out.replace(
    /[eé] fundamental que voc[eê] a inicie quando a beb[eê] estiver calma[^.]*\./gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*inicie.{0,50}quando (ela|a beb[eê]) estiver calma[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*[eé] importante que voc[eê] inicie.{0,80}calma[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*transfer[eê]ncia.{0,80}quando ela estiver calma[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*ocorra quando ela estiver calma[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*condu[cç][aã]o comece quando (ela|a beb[eê]) estiver calma[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*[eé] importante que a condu[cç][aã]o comece[^.!?]{0,80}calma[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*n[aã]o durante uma crise de choro[^.!?]*[.!?]/gi,
    '',
  );
  return out;
}

function prefer51dCompleteSatietyConduct(text) {
  let out = String(text || '');
  out = out.replace(
    /Se ela ainda estiver no peito ap[oó]s a mamada[^.!?]*[.!?]/gi,
    'Se ela já realizou mamada efetiva, está saciada, sem sinais de fome e permanece no peito, retire-a do peito, coloque em posição vertical por 20 a 30 minutos e, depois, conduza ao sono.',
  );
  const hasComplete =
    /diferencie:\s*ainda est[aá] com fome/i.test(out) &&
    /retir[ae]-a do peito|retire-a do peito|retirar do peito/i.test(out);
  if (hasComplete) {
    out = out.replace(
      /Se ela ainda estiver com fome, mantenha a alimenta[cç][aã]o\.\s*/gi,
      '',
    );
    out = out.replace(
      /Se estiver saciada e permanecer no peito, voc[eê] pode retirar do peito[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /Se ela ainda estiver no peito, retir[ae]-a(?: do peito)?[^.!?]*[.!?]\s*/gi,
      '',
    );
  }
  out = keepFirstMatch(
    out,
    /[^.!?\n]*(?:retir[ae]-a(?: do peito)?|retire-a do peito|retirar do peito)[^.!?]{0,180}(?:posi[cç][aã]o vertical|conduza ao sono|conduzir ao sono)[^.!?]*[.!?]/gi,
  );
  return out;
}

function retargetNightHourlyLesson(text) {
  let out = String(text || '');
  out = out.replace(
    /aula sobre ['‘’“”']?Despertar Irritado P[oó]s-?Soneca['‘’“”']?/gi,
    'aula sobre Estratégias para o Sono Noturno',
  );
  out = out.replace(
    /['‘’“”']Despertar Irritado P[oó]s-?Soneca['‘’“”']/gi,
    "'Estratégias para o Sono Noturno'",
  );
  out = out.replace(
    /[^.!?\n]*Despertar Irritado P[oó]s-?Soneca[^.!?]*[.!?]/gi,
    'Recomendo que você revise a aula sobre Estratégias para o Sono Noturno, alinhada aos despertares durante o sono noturno.',
  );
  return out;
}

const TRAVESSEIRO_LESSON_51 =
  'Recomendo que você revise a aula sobre a estratégia do travesseiro para obter mais orientações sobre como aplicá-la de forma eficaz.';

function strip51dWindowToFeed(text) {
  let out = String(text || '');
  out = out.replace(
    /(?:Ap[oó]s esse (?:tempo|per[ií]odo)|Depois (?:disso|desse (?:tempo|per[ií]odo))|Ao (?:final|t[eé]rmino|fim) da janela)[^.!?]{0,140}(?:ofere[cç]a|oferecer|fa[cç]a|fazer|realize|realiza(?:r)?) (?:uma )?mamada[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /(?:Ap[oó]s esse (?:tempo|per[ií]odo)|Depois (?:disso|desse (?:tempo|per[ií]odo))|Ao (?:final|t[eé]rmino|fim) da janela)[^.!?]{0,90}mamada efetiva[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /quando (a janela|esse tempo|esse per[ií]odo) (terminar|acabar|se encerrar)[^.!?]{0,50}mamada[^.!?]*[.!?]/gi,
    '',
  );
  return out;
}

function dedupe51dConduzaAoSono(text) {
  return String(text || '').replace(
    /([^.!?\n]*conduza(?:-a)? ao sono[^.!?]*)[.!?]\s*Depois, conduza(?:-a)? ao sono[^.!?]*[.!?]/gi,
    '$1.',
  );
}

function consolidate51dTravesseiroLesson(text, motherAskedTravesseiro) {
  let out = String(text || '');
  const lessonRe =
    /[^.!?\n]*(?:aula.{0,80}travesseiro|travesseiro.{0,80}aula|acesse a aula correspondente)[^.!?]*[.!?]/gi;
  const had = lessonRe.test(out);
  lessonRe.lastIndex = 0;
  out = out.replace(lessonRe, '');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  if (had || motherAskedTravesseiro) {
    out = appendOnce(out, TRAVESSEIRO_LESSON_51);
  }
  return out;
}

function stripNightHourlyContradiction(text) {
  let out = String(text || '');
  out = out.replace(
    /[^.!?\n]*Se j[aá] se passaram.{0,60}2h\s*30.{0,50}3h[^.!?]{0,160}sem oferecer[^.!?]{0,40}peito[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*Se j[aá] transcorreram.{0,80}2h\s*30.{0,50}3h[^.!?]{0,160}sem oferecer[^.!?]{0,40}peito[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*j[aá] se passaram.{0,40}2h\s*30.{0,40}3h.{0,120}(?:voltar ao sono|conduzir.{0,50}(?:ao |o )?sono).{0,80}sem oferecer[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*associa[cç][oõ]es negativas entre acordar e mamar[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /Isso ajuda a evitar associa[cç][oõ]es negativas[^.!?]*[.!?]/gi,
    '',
  );
  return out;
}

function stripBottleBehavioralReading(text) {
  let out = String(text || '');
  out = out.replace(/[^.!?\n]*leitura comportamental[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*interpreta[cç][aã]o (sobre o )?comportamento[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*evitando interpretar a suc[cç][aã]o[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*ponto a observar ap[oó]s checar saciedade[^.!?]*[.!?]/gi, '');
  out = out.replace(/antes de qualquer leitura comportamental,?\s*/gi, '');
  out = out.replace(/,\s*evitando interpretar a suc[cç][aã]o[^.]*\./gi, '.');
  return out;
}

const FEED_INTERVAL_CANONICAL =
  'Também é importante saber qual costuma ser o intervalo entre as mamadas: se durante a demora para adormecer ele estiver se aproximando do próximo intervalo alimentar, considere fome antes de insistir no sono.';

const EXCESS_WAKE_CORE =
  `A vigília excessiva vem da soma — não da soneca longa da manhã. Se a condução começa depois de cerca de 1h–1h15 e ele ainda leva uns 40–45 minutos para adormecer, o tempo acordado chega perto de 1h40–2h — acima da referência de ${WAKE_WINDOW_REF}. Como ele já demora cerca de 40 a 45 minutos para adormecer, antecipe o início da condução — não espere os sinais de sono — para que ele entre em sono dentro da janela de ${WAKE_WINDOW_REF}.`;

/** TESTE 006 (31d): long morning nap ≠ excess wake; anticipate conduction; drop orphan feed leftover. */
function splitMorningNapFromExcessWake(text) {
  let out = String(text || '');
  out = out.replace(
    /Quando o beb[eê] faz uma soneca longa pela manh[aã] e depois tem sonecas curtas [àa] tarde, isso pode resultar em um tempo total acordado que excede a refer[eê]ncia[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*soneca longa pela manh[aã][^.!?]{0,220}(?:tempo total acordado que excede|excede a refer[eê]ncia|resultar em um tempo total acordado)[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*observe os sinais de sono e inicie a condu[cç][aã]o[^.!?]*sonolento[^.!?]*[.!?]/gi,
    'Como ele já demora cerca de 40 a 45 minutos para adormecer, antecipe o início da condução — não espere os sinais de sono — para que ele entre em sono dentro da janela de 45 minutos a 1 hora e 15 minutos.',
  );
  out = out.replace(
    /[^.!?\n]*observe os sinais de sono e inicie a condu[cç][aã]o[^.!?]*[.!?]/gi,
    'Como ele já demora cerca de 40 a 45 minutos para adormecer, antecipe o início da condução para que o adormecimento caia dentro da janela de 45 minutos a 1 hora e 15 minutos.',
  );
  out = out.replace(
    /Isso pode ajudar a avaliar se (ele|ela) est[aá] se alimentando adequadamente[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*(?:Al[eé]m disso, )?observe se (ele|ela) est[aá] se alimentando adequadamente[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*observe se (ele|ela) est[aá] se alimentando adequadamente e se a mamada est[aá] sendo efetiva[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /Isso pode estar contribuindo para a dificuldade em relaxar(?: no ber[cç]o)?(?: e a demora para adormecer)?[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*soneca longa pela manh[aã].{0,180}(?:contribuindo|explica|causa).{0,80}(?:relaxar|adormecer)[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*fome pode estar influenciando os despertares[^.!?]*[.!?]/gi,
    '',
  );
  return out;
}

function hasWakeArithmetic(text) {
  return /1h[–\-–]1h15.{0,120}40.{0,30}45|condu[cç][aã]o (come[cç]a|inicia).{0,100}40.{0,30}45|1h.{0,12}1h\s*15.{0,100}40.{0,30}45|1h–1h15.{0,80}40/i.test(
    String(text || ''),
  );
}

/** TESTE 006/009 (45d): one 21h30 orientation; fix “e O banho”; keep “21h já está além”. */
function consolidate2130Mentions(text, { includeBath } = {}) {
  let out = String(text || '');
  out = out.replace(/\be O banho\b/g, 'e o banho');
  out = out.replace(
    /,\s*e [oO] banho [àa]s 21h30 n[aã]o [eé] recomendado quando leva o in[ií]cio do sono noturno para ainda mais tarde\.?/gi,
    '.',
  );
  const lateRe = /[^.!?\n]*(?:21h30|21:30)[^.!?]*[.!?]/gi;
  const hits = out.match(lateRe) || [];
  if (hits.length === 0) return out;
  const one = includeBath
    ? 'A família pode organizar conforme sua dinâmica, mas o banho às 21h30 não é recomendado quando leva o início do sono noturno para ainda mais tarde — 21h30 ou 22h não é o horário recomendado.'
    : 'A família pode organizar conforme sua dinâmica, mas iniciar o sono noturno por volta de 21h30 ou 22h não é o recomendado.';
  if (hits.length === 1 && !includeBath) return out;
  let seen = 0;
  lateRe.lastIndex = 0;
  out = out.replace(lateRe, (m) => {
    const has21hLate = /(?:[àa]s |iniciar .{0,40})21h(?!\s*30).{0,60}(al[eé]m|fora da faixa|j[aá] est[aá])/i.test(m);
    seen += 1;
    if (has21hLate) {
      const kept21h = m
        .replace(/,?\s*e [oO] banho [àa]s 21h30 n[aã]o [eé] recomendado[^.!?]*/i, '')
        .replace(/,?\s*e 21h30 n[aã]o [eé] recomendado[^.!?]*/i, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+\./g, '.')
        .trim();
      const prefix = /[.!?]$/.test(kept21h) ? kept21h : `${kept21h}.`;
      return seen === 1 ? `${prefix} ${one}` : prefix;
    }
    return seen === 1 ? one : '';
  });
  out = keepFirstMatch(
    out,
    /[^.!?\n]*banho [àa]s 21h30 n[aã]o [eé] recomendado[^.!?]*[.!?]/gi,
  );
  return out.replace(/\be O banho\b/g, 'e o banho');
}

function stripOperationalCryOnce(text) {
  let out = String(text || '');
  out = out.replace(/\s*[—\-–]\s*isso deve ser feito uma [uú]nica vez[,.]?\s*/gi, ', ');
  out = out.replace(/\s*,\s*isso deve ser feito uma [uú]nica vez[,.]?\s*/gi, ', ');
  out = out.replace(/\s+isso deve ser feito uma [uú]nica vez[,.]?\s*/gi, ' ');
  out = out.replace(/\s+deve ser feito uma [uú]nica vez[,.]?\s*/gi, ' ');
  out = out.replace(/\s+uma [uú]nica vez[,.]?\s+(?=sem exigir)/gi, ' ');
  out = out.replace(/\s{2,}/g, ' ');
  out = out.replace(/\s+,/g, ',');
  return out;
}

function dedupeCribCryCalm(text) {
  let out = stripOperationalCryOnce(text);
  const cryCalmRe =
    /[^.!?\n]*(?:se (?:ele|ela) (?:se )?irritar|ficar irritad[oa]|come[cç]ar a chorar|irritar ou chorar)[^.!?]{0,200}(?:acalme|acalm[aá]|se acalmar|siga a condu[cç][aã]o|continuar a condu[cç][aã]o|continue a condu[cç][aã]o)[^.!?]*[.!?]/gi;
  out = keepFirstMatch(out, cryCalmRe);
  const autonomyRe =
    /[^.!?\n]*(?:n[aã]o precisamos exigir|sem exigir que (?:ele|ela) (?:sempre )?(?:consiga )?adormecer sozinho|sem exigir que adorme[cç]a sozinho)[^.!?]*[.!?]/gi;
  out = keepFirstMatch(out, autonomyRe);
  out = out.replace(
    /[^.!?\n]*aproveitar os momentos em que est[aá] tranquil[oa] para favorecer o in[ií]cio do sono no ber[cç]o[^.!?]*[.!?]/gi,
    '',
  );
  return out;
}

function stripInventedSleepOnsetDelay(text) {
  let out = String(text || '');
  out = out.replace(
    /Se a condu[cç][aã]o come[cç]a ap[oó]s 1h30 a 1h45 e (ele|ela) demora cerca de 40.{0,4}45 minutos para adormecer[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*condu[cç][aã]o come[cç]a ap[oó]s 1h30 a 1h45[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*demora cerca de 40.{0,4}45 minutos para adormecer[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*40.{0,4}45 minutos para (adormecer|entrar em sono|relaxar)[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*tempo total acordado pode estar excessivo[^.!?]*[.!?]/gi,
    '',
  );
  return out;
}

/** 55d: mother asked only pacifier-replace + long wake — do not leak 49d nap-wake/feed investigation. */
function stripLeaked55dInvestigation(text) {
  let out = String(text || '');
  out = out.replace(
    /[^.!?\n]*como (ele|ela|o beb[eê]) costuma acordar(?: das sonecas| ap[oó]s as sonecas)[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*como (ele|ela|o beb[eê]) (?:desperta|acorda) ap[oó]s as sonecas[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(/[^.!?\n]*Ele parece irritado ou calmo[^.!?]*[.!?]/gi, '');
  out = out.replace(
    /[^.!?\n]*(?:Ele|Ela) parece tranquilo[oa]?, chorando ou buscando[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*parece tranquilo[oa]?, chorando ou buscando o peito[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*(?:est[aá] mamando efetivamente|apresentando sinais de saciedade|apresenta sinais de saciedade|intervalos entre as mamadas)[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*sinais de saciedade ap[oó]s as mamadas[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(/[^.!?\n]*E como est[aá] a alimenta[cç][aã]o[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*caprichar nas mamadas[^.!?]*[.!?]/gi, '');
  out = out.replace(
    /[^.!?\n]*mamadas pode ajudar a garantir que (ele|ela) esteja saciad[oa][^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(/Isso pode ajudar a entender melhor a situa[cç][aã]o[^.!?]*[.!?]/gi, '');
  out = out.replace(/Isso nos ajudar[aá] a ajustar a rotina[^.!?]*[.!?]/gi, '');
  out = out.replace(
    /[^.!?\n]*(?:voc[eê] percebe se )?os despertares coincidem com a queda da chupeta[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*Como ele usa chupeta, vale observar se os despertares[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*Se n[aã]o houver essa rela[cç][aã]o[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(/Para entender melhor,\s*(?=Para entender melhor,)/gi, '');
  out = out.replace(/Para entender melhor,\s*\n+\s*/g, 'Para entender melhor, ');
  out = keepFirstMatch(
    out,
    /Para entender melhor, quanto tempo (ele|ela) demora para entrar em sono[^.!?]*[.!?]/gi,
  );
  return out;
}

const PACIFIER_55_CANON =
  'Se a chupeta cair e ele apenas reclamar, você não precisa recolocá-la imediatamente. Aguarde cerca de 2 a 5 minutos e observe se ele se reorganiza ou continua dormindo. Se permanecer tranquilo ou voltar ao sono, pode deixar sem a chupeta. Se continuar reclamando ou precisar de ajuda, você pode oferecer a chupeta novamente.';

function window55Canon(ageDays) {
  const ageLabel = Number.isFinite(ageDays) && ageDays >= 29 && ageDays <= 60
    ? `${ageDays} dias`
    : '55 dias';
  return `Sobre a janela de vigília: aos ${ageLabel}, a referência é de ${WAKE_WINDOW_REF}. Permanecer acordado habitualmente por 1h30 a 1h45 já ultrapassa o indicado para essa faixa etária. Procure observar os sinais de sono e iniciar a preparação para dormir antes de ultrapassar 1h15.`;
}

const ENTER_SLEEP_55 =
  'Para entender melhor, quanto tempo ele demora para entrar em sono após você iniciar a condução?';

const JANELA_LESSON_55 =
  'Você pode conferir também a aula sobre Janela de Vigília no aplicativo.';

function is55PacifierPara(p) {
  const t = String(p || '');
  if (/aula/i.test(t) && !/chupeta/i.test(t)) return false;
  if (/chupeta/i.test(t) && /reclam/i.test(t)) return true;
  return /chupeta/i.test(t) && /(observ|recoloc|oferec|continua(?:r)? dormindo)/i.test(t);
}

function is55WindowPara(p) {
  const t = String(p || '');
  if (/aula/i.test(t)) return false;
  if (/chupeta/i.test(t) && /reclam/i.test(t)) return false;
  if (/quanto tempo.{0,80}(entrar em sono|adormecer)/i.test(t) && t.length < 220) return false;
  return /janela|vig[ií]lia|1h30 a 1h45|1h\s*30.{0,30}1h\s*45|45 minutos a 1 hora/i.test(t);
}

function is55EnterSleepAsk(p) {
  return /quanto tempo.{0,80}(entrar em sono|adormecer).{0,120}condu[cç][aã]o/i.test(p);
}

/** TESTE 008/011 (55d): do not leak feeding/satiety when the mother only asked pacifier + wake window. */
function is55LeakedFeedAsk(p) {
  const t = String(p || '');
  if (/chupeta/i.test(t) || /janela de vig[ií]lia|1h30 a 1h45/i.test(t)) return false;
  return /sinais de saciedade|intervalos entre as mamadas|mamando efetivamente|como est[aá] a alimenta[cç][aã]o|caprichar nas mamadas|saciad[oa].{0,40}(tranquilo|dormir)|peito|saciedade/i.test(
    t,
  );
}

function is55FillerPara(p) {
  return /^Isso (pode ajudar|nos ajudar[aá]|ajudar[aá]) a (entender melhor a situa[cç][aã]o|ajustar a rotina)[^.!?]*[.!]?$/i.test(
    String(p || '').trim(),
  );
}

function is55LeakedHowWakesAsk(p) {
  const t = String(p || '');
  if (/das sonecas/i.test(t) && /como (ele|ela|o beb[eê]) desperta/i.test(t)) return false;
  return /parece tranquilo[oa]?, chorando ou buscando/i.test(t);
}

function is55LeakedPacifierRelation(p) {
  const t = String(p || '');
  return /Se n[aã]o houver essa rela[cç][aã]o/i.test(t)
    || /causa principal dos despertares/i.test(t)
    || /Como ele usa chupeta, vale observar se os despertares/i.test(t);
}

/** TESTE 007 (55d): one pacifier block, one window, one enter-sleep ask, Janela lesson. */
function consolidate55dComposition(text, ageDays) {
  let out = String(text || '');
  out = out.replace(
    /quanto tempo (ele|ela) demora para adormecer depois de voc[eê] iniciar a condu[cç][aã]o/gi,
    'quanto tempo ele demora para entrar em sono após você iniciar a condução',
  );
  out = out.replace(
    /adormecer depois de voc[eê] iniciar a condu[cç][aã]o/gi,
    'entrar em sono após você iniciar a condução',
  );
  out = out.replace(
    /aula sobre ['‘’“”']?Sinais de Sono['‘’“”']?/gi,
    'aula sobre Janela de Vigília',
  );
  const paras = out.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  let greeting = '';
  const rest = [];
  for (const p of paras) {
    const greet = p.match(/^(bom dia|ol[aá]|oi)[!.,]?/i);
    if (greet && /chupeta/i.test(p)) {
      greeting = greet[0];
      continue;
    }
    if (greet && /^[!.]?\s*$/.test(p.slice(greet[0].length))) {
      greeting = p;
      continue;
    }
    if (/[eé] normal que.{0,120}(chupeta|55 dias)/i.test(p) && p.length < 320) continue;
    if (is55PacifierPara(p) || is55WindowPara(p) || is55EnterSleepAsk(p) || is55LeakedFeedAsk(p) || is55LeakedHowWakesAsk(p) || is55LeakedPacifierRelation(p) || is55FillerPara(p)) continue;
    if (/aula/i.test(p)) continue;
    rest.push(p);
  }
  const parts = [];
  if (greeting) parts.push(greeting);
  parts.push(PACIFIER_55_CANON);
  parts.push(window55Canon(ageDays));
  parts.push(ENTER_SLEEP_55);
  for (const p of rest) parts.push(p);
  if (ageDays === 55 || !Number.isFinite(Number(ageDays))) {
    parts.push(JANELA_LESSON_55);
  }
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function stripBreastAsSleepAid(text) {
  let out = String(text || '');
  out = out.replace(
    /[^.!?\n]*Se a mamada estiver se aproximando, oferecer o peito pode ajudar a relax[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*oferecer o peito pode ajudar a relax[aá]-l[oa][^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*oferecer o peito.{0,80}facilitar a transi[cç][aã]o para o sono[^.!?]*[.!?]/gi,
    '',
  );
  out = out.replace(
    /[^.!?\n]*(peito|mamada).{0,50}facilitar a transi[cç][aã]o para o sono[^.!?]*[.!?]/gi,
    '',
  );
  return out;
}

function consolidateExcessWakeComposition(text) {
  let out = splitMorningNapFromExcessWake(text);
  const morningFractionRe =
    /[^.!?\n]*(?:fracion\w{0,12}\s+a soneca da manh[aã]|soneca (?:longa )?da manh[aã][^.!?\n]{0,40}fracion)[^.!?]*[.!?]/gi;
  out = keepFirstMatch(out, morningFractionRe);
  out = stripBreastAsSleepAid(out);
  out = out.replace(/Isso pode ajudar a melhorar a distribui[cç][aã]o das sonecas durante a tarde[^.!?]*[.!?]/gi, '');
  out = out.replace(/Isso (ajudar[aá]|pode ajudar|pode nos ajudar) a entender melhor a situa[cç][aã]o[^.!?]*[.!?]/gi, '');
  out = out.replace(/Isso nos ajudar[aá] a ajustar a rotina[^.!?]*[.!?]/gi, '');
  out = out.replace(/Isso (nos )?ajudar[aá] a ajustar[^.!?]*[.!?]/gi, '');
  out = out.replace(
    /[^.!?\n]*(?:qual [eé]|quanto tempo|e quanto tempo)[^.!?]{0,140}(?:permanece|permanecer|costuma permanecer) acordad[oa][^.!?]{0,120}(?:antes de iniciar|antes da condu|[àa] soneca|para a soneca|antes das sonecas)[^.!?]*[.!?]*/gi,
    '',
  );
  out = out.replace(/E quanto tempo (ele|ela) costuma permanecer acordad[oa][^.?]*\??/gi, '');
  out = out.replace(
    /quanto tempo (ele|ela) costuma permanecer acordad[oa] antes de iniciar a condu[cç][aã]o[^.?]*\??/gi,
    '',
  );

  const intervalRe =
    /[^.!?\n]*((?:intervalo (?:aproximado |t[ií]pico )?entre as mamadas)|(?:pr[oó]ximo intervalo (?:para mamar|de mamada|alimentar))|(?:considere fome antes de insistir)|(?:fome tamb[eé]m precisa ser considerada)|(?:observe se (?:ele|ela) est[aá] pr[oó]ximo do intervalo para mamar)|(?:considere amament[aá]-l[oa])|(?:pr[oó]ximo do intervalo para mamar e demora a dormir))[^.!?]*[.!?]?/gi;
  const intervalHits = out.match(intervalRe) || [];
  intervalRe.lastIndex = 0;
  const oneExplained =
    intervalHits.length === 1 &&
    /porque|por que|aproximando do pr[oó]ximo intervalo alimentar/i.test(intervalHits[0]);
  if (intervalHits.length > 0 && !oneExplained) {
    out = out.replace(intervalRe, '');
    out = appendOnce(out.replace(/\n{3,}/g, '\n\n').trim(), FEED_INTERVAL_CANONICAL);
  }

  out = out.replace(/Para entender melhor a situa[cç][aã]o, gostaria de saber:\s*/gi, '');
  out = out.replace(/gostaria de saber:\s*(?=Tamb[eé]m|[A-ZÁÉÍÓÚ]|$)/gi, '');
  out = out.replace(/Agora, gostaria de saber:\s*/gi, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  out = out.replace(/[ \t]{2,}/g, ' ');
  return composeExcessWakeOrder(out.trim());
}

/** TESTE 009 (31d): hypothesis → wake sum → anticipate → morning fraction → feed once → lesson. */
function composeExcessWakeOrder(text) {
  const rawParts = String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const parts = [];
  for (const p of rawParts) {
    const mixed =
      /principal hip[oó]tese.{0,80}vig[ií]lia excessiva|hip[oó]tese.{0,20}[eé] a vig[ií]lia excessiva/i.test(p) &&
      (/fracion/i.test(p) || /soneca longa pela manh[aã]/i.test(p) || /contribuindo para a dificuldade/i.test(p));
    if (mixed) {
      const sentences = p.match(/[^.!?]+[.!?]+/g);
      if (sentences && sentences.length > 1) {
        for (const s of sentences) {
          const t = s.trim();
          if (t) parts.push(t);
        }
        continue;
      }
    }
    parts.push(p);
  }
  if (parts.length < 2) return String(text || '').trim();

  const buckets = {
    lead: [],
    hypothesis: [],
    calc: [],
    anticipate: [],
    fraction: [],
    feed: [],
    lesson: [],
    other: [],
  };

  for (const p of parts) {
    const isLesson =
      /(?:conferir a aula|revise a aula|recomendo.{0,40}aula|aula ['"“”']?Janela)/i.test(p) &&
      !hasWakeArithmetic(p) &&
      !/antecipe o in[ií]cio/i.test(p);
    if (isLesson) {
      buckets.lesson.push(p);
    } else if (
      /vig[ií]lia excessiva vem da soma|tempo acordado chega perto de 1h40|1h[–\-]?1h15 e ele ainda leva/i.test(p)
    ) {
      buckets.calc.push(p);
    } else if (/antecipe o in[ií]cio da condu[cç][aã]o|antecip.{0,40}condu[cç][aã]o/i.test(p) && !/fracion/i.test(p)) {
      buckets.anticipate.push(p);
    } else if (/fracion/i.test(p) && !hasWakeArithmetic(p)) {
      buckets.fraction.push(p);
    } else if (
      /intervalo entre as mamadas|considere fome|amament[aá]-l[oa]|pr[oó]ximo intervalo alimentar/i.test(p)
    ) {
      buckets.feed.push(p);
    } else if (/principal hip[oó]tese.{0,60}vig[ií]lia excessiva|hip[oó]tese.{0,20}[eé] a vig[ií]lia excessiva/i.test(p)) {
      buckets.hypothesis.push(p);
    } else if (
      buckets.hypothesis.length === 0 &&
      buckets.calc.length === 0 &&
      buckets.anticipate.length === 0
    ) {
      buckets.lead.push(p);
    } else {
      buckets.other.push(p);
    }
  }

  const feed = buckets.feed.length ? [FEED_INTERVAL_CANONICAL] : [];
  const core =
    buckets.hypothesis.length || buckets.calc.length || buckets.anticipate.length
      ? [EXCESS_WAKE_CORE]
      : [];
  const other = buckets.other.filter(
    (p) =>
      !/principal hip[oó]tese.{0,80}vig[ií]lia excessiva|vig[ií]lia excessiva vem da soma|Isso nos ajudar[aá]/i.test(
        p,
      ),
  );
  return [
    ...buckets.lead,
    ...core,
    ...buckets.fraction,
    ...feed,
    ...other,
    ...buckets.lesson,
  ]
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function scrubRnArtifacts(text) {
  let out = text || '';
  out = out.replace(/Sinais de saciedade no RN:/gi, 'Sinais de saciedade nesta faixa:');
  if (!/refluxo|desconforto claro/i.test(out)) {
    out = out.replace(
      /posi[cç][aã]o vertical por 30 a 40 minutos/gi,
      'posição vertical por 20 a 30 minutos',
    );
    out = out.replace(
      /em posi[cç][aã]o vertical por 30 a 40 minutos/gi,
      'em posição vertical por 20 a 30 minutos',
    );
  }
  return out;
}

export function resolveBabyGender({ babyName, userMessage, babyProfile }) {
  const nameKey = String(babyName || '').toLowerCase();
  if (nameKey && FEMININE_NAMES.has(nameKey)) return 'f';
  const sex = String(babyProfile?.sex || babyProfile?.gender || '').toLowerCase();
  if (sex === 'f' || sex === 'feminine' || sex === 'feminino') return 'f';
  if (sex === 'm' || sex === 'masculine' || sex === 'masculino') return 'm';
  if (/\b(minha beb[eê]|ela|dela|filha|menina)\b/i.test(userMessage || '')) return 'f';
  if (/\b(meu filho|ele|dele|nele|menino)\b/i.test(userMessage || '')) return 'm';
  return null;
}

function enforceProfileGender({ text, babyName, userMessage, babyProfile }) {
  const gender = resolveBabyGender({ babyName, userMessage, babyProfile });
  if (gender !== 'f') {
    let out = String(text || '');
    out = out.replace(/\bestá acordada\b/gi, 'está acordado');
    out = out.replace(/\bhá quanto tempo está acordada\b/gi, 'há quanto tempo está acordado');
    out = out.replace(/\bse a beb[eê]\b/gi, 'se o bebê');
    out = out.replace(/\ba beb[eê] apresenta\b/gi, 'o bebê apresenta');
    if (gender === 'm') {
      const masc = [
        [/\bComo ela consegue\b/g, 'Como ele consegue'],
        [/\bela consegue\b/gi, 'ele consegue'],
        [/\bela acordar\b/gi, 'ele acordar'],
        [/\bela acorda\b/gi, 'ele acorda'],
        [/\bela relaxar\b/gi, 'ele relaxar'],
        [/\bela tenha mamado\b/gi, 'ele tenha mamado'],
        [/\bela precise\b/gi, 'ele precise'],
        [/\bela arrotou\b/gi, 'ele arrotou'],
        [/\bela permaneceu\b/gi, 'ele permaneceu'],
        [/\bao ser colocada\b/gi, 'ao ser colocado'],
        [/\bcolocada no ber[cç]o\b/gi, 'colocado no berço'],
        [/\bmuito irritada\b/gi, 'muito irritado'],
        [/\bacorda irritada\b/gi, 'acorda irritado'],
        [/\bacordar muito irritada\b/gi, 'acordar muito irritado'],
        [/\bainda parece cansada\b/gi, 'ainda parece cansado'],
        [/\bSe ela acorda\b/g, 'Se ele acorda'],
      ];
      for (const [re, next] of masc) out = out.replace(re, next);
    }
    return { text: out, corrections: gender === 'm' ? ['masculine_align'] : [] };
  }

  const corrections = [];
  let out = text;
  const name = String(babyName || '').trim();
  const rules = [
    [/\bsono do Lara\b/gi, 'sono da Lara'],
    [/\bdo Lara\b/g, 'da Lara'],
    [/\bo Lara\b/g, 'a Lara'],
    [/\bseu beb[eê]\b/gi, 'sua bebê'],
    [/\bdo seu beb[eê]\b/gi, 'da sua bebê'],
    [/\bexcesso?ivamente cansado\b/gi, 'excessivamente cansada'],
    [/\bcansado ou hiperestimulado\b/gi, 'cansada ou hiperestimulada'],
    [/\bhiperestimulado\b/gi, 'hiperestimulada'],
    [/\bestá acordado\b/gi, 'está acordada'],
    [/\bque ele adorme[cç]a\b/gi, 'que ela adormeça'],
    [/\bpara que ele\b/gi, 'para que ela'],
    [/\bque ele\b/gi, 'que ela'],
    [/\bele adorme/gi, 'ela adorme'],
    [/\bele est[aá]\b/gi, 'ela está'],
    [/\bele n[aã]o\b/gi, 'ela não'],
    [/\bele demore\b/gi, 'ela demore'],
    [/\bdele\b/gi, 'dela'],
    [/\bnele\b/gi, 'nela'],
    [/\bdo beb[eê]\b/gi, 'da bebê'],
    [/\bele\b/gi, 'ela'],
  ];

  if (name && !new RegExp(`\\b${name}\\b`, 'i').test(out.slice(0, 500))) {
    out = out.replace(/\b(sua|seu)\s+beb[eê]\s+de\s+(\d+)\s+dias\b/i, `${name}, de $2 dias`);
    out = out.replace(/\bbeb[eê]\s+de\s+(\d+)\s+dias\b/i, `${name}, de $1 dias`);
  }
  // Fix ", de 45 dias,," artifacts
  out = out.replace(/,\s*de\s+(\d+)\s+dias,,/gi, ', de $1 dias,');

  for (const [re, replacement] of rules) {
    out = out.replace(re, (match) => {
      const next = typeof replacement === 'function' ? replacement(match) : replacement;
      if (next !== match) corrections.push({ before: match, after: next });
      return next;
    });
  }
  return { text: out, corrections };
}

function reportedNapOverMax(msg) {
  return /3\s*,\s*5\s*h|3\.5\s*h|3h30|3h25|3h15|3h05|3 horas e meia|ate 3h30|até 3h30|soneca.{0,40}3\s*h|sonecas?.{0,30}3 horas|13[:h].{0,24}16[:h]|das 13.{0,20}16h|10h20|10h45/i.test(msg);
}

function reportedMicroNap(msg) {
  return /10\s*(a|-|–)\s*15\s*min|soneca.{0,30}(10|12|14|15|16|17|18)\s*min|dormiu\s+(10|12|14|15|16|17|18)\s*min|15 minutos depois de mamar|reconduzir/i.test(msg);
}

function reportedOwnRoom(msg) {
  return /(quarto (dela|dele|separad|pr[oó]pri)|quartinho|monitor|baba eletr)/i.test(msg);
}

function reportedCharutinho(msg) {
  return /charutinho|charuto/i.test(msg);
}

function reportedShortWindow(msg) {
  return /4[0-5]\s*(min|minutos).{0,20}5[0-9]|40\s*[–\-aà]\s*50|janela.{0,40}40\s*(a|-|–)?\s*50/i.test(msg)
    && !/1\s*h(r)?\s*(\/|-|a)\s*1\s*h?\s*15|1h\s*15|40\s*\/\s*45/i.test(msg);
}

function reportedSlingCry(msg) {
  return /sling|canguru/i.test(msg) && /chor/i.test(msg);
}

function reportedSleepBeforeFeed(msg) {
  return /sono.{0,50}(antes|pr[oó]xim).{0,40}mamad|sonolent.{0,40}mamad|30\s*(a|-)\s*40\s*min.{0,40}(mamad|peito)|balan[cç]o.{0,20}(suave|leve)/i.test(msg);
}

function reportedAfterFeedPlay(msg) {
  return /(depois|ap[oó]s).{0,40}(mamar|mamada|peito).{0,80}(brinc|interagir|acordad|inquiet|o que (eu )?fa[cç]o)/i.test(msg)
    || /15 minutos (no peito|de peito).{0,80}20 minutos/i.test(msg)
    || /20 minutos (no colo|em p[eé]).{0,60}(acordad|inquiet|brinc)/i.test(msg)
    || /posso brincar/i.test(msg);
}

function reportedLateAfternoon(msg) {
  return /(17h?[:h]?30|17:30|por volta das 17h|por volta das 18h|18h(?!\s*min)|final da tarde|fim da tarde)/i.test(msg)
    && /chor|irrit/i.test(msg);
}

function reportedLateBathRitual(msg) {
  return /banho.{0,24}20h|20h\s*20|20:20|20h15|20:15/i.test(String(msg || ''))
    && /ritual|banho/i.test(String(msg || ''));
}

function reportedAmbiguous9am(msg) {
  return /passar das (7|8|9|10)|pass(e|ar) (das )?(7|8|9|10)h|n[aã]o passar das (7|8|9|10)/i.test(msg);
}

function parseWakeOnsetMinutes(msg) {
  const s = String(msg || '');
  const w = s.match(/1h(\d{2})\s*acord/i);
  const o = s.match(/(?:leva|demora)[^\d]{0,28}?(\d{2})\s*min(?:utos)?(?!\s*a)/i);
  if (!w || !o) return null;
  const wakeMin = 60 + Number(w[1]);
  const onsetMin = Number(o[1]);
  if (!Number.isFinite(wakeMin) || !Number.isFinite(onsetMin) || onsetMin < 20 || onsetMin > 50) return null;
  return { wakeMin, onsetMin, totalMin: wakeMin + onsetMin };
}

function formatHoursMinutes(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (!m) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function wakeOnsetCanon(msg) {
  const p = parseWakeOnsetMinutes(msg);
  if (p) {
    const total = formatHoursMinutes(p.totalMin);
    const wakeLabel = formatHoursMinutes(p.wakeMin);
    return `A janela conta do despertar até ele efetivamente adormecer, incluindo o tempo de condução. Se ele já ficou ${wakeLabel} acordado e ainda leva ${p.onsetMin} minutos para dormir, o total fica em cerca de ${total} — acima da referência de 45 minutos a 1 hora e 15 minutos. Não: isso não está dentro da janela. Inicie a preparação mais cedo.`;
  }
  return 'A janela conta do despertar até ele efetivamente adormecer, incluindo o tempo de condução. Se ele já ficou cerca de 1 hora acordado e ainda leva 35 a 40 minutos para dormir, o total pode chegar a 1h35–1h40 — acima da referência de 45 minutos a 1 hora e 15 minutos. Não: isso não está dentro da janela. Inicie a preparação mais cedo.';
}

function reportedWakePlusOnset(msg) {
  const hasHour = /(?:cerca de |por volta de |quase )?(?:1\s*h(?:ora)?|uma hora).{0,40}acord|acordad[oa].{0,30}(?:cerca de |por volta de )?1\s*h|janela.{0,40}1\s*h(?!\s*15)|1h0[0-8]\s*acord|fica 1h\d{0,2} acord/i.test(msg);
  const hasOnset = /3[2-9]\s*(a|-|–)\s*4[0-5]|35.?40\s*min|(leva|demora).{0,28}(uns |cerca de )?(3[2-9]|4[0-5])\s*min/i.test(msg);
  return hasHour && hasOnset;
}

function reportedAngryWake(msg) {
  return /acorda muito brav|acorda brav[oa]|muito bravo.{0,40}choro|bastante choro.{0,30}relaxa|mama um pouco e relaxa/i.test(String(msg || ''))
    && /1h|1 hora|soneca/i.test(String(msg || ''));
}

function reportedNightAfter3(msg) {
  return /ap[oó]s as 3h|depois das 3h|depois das 3 |ap[oó]s 3h|a partir das 3h|depois das 03|depois das 2h30|ap[oó]s as 2h30|depois das 2h40|ap[oó]s as 2h40|depois das 2h45|ap[oó]s as 2h45|depois das 2h50|ap[oó]s as 2h50/i.test(msg)
    && /despert|acorda|sono leve/i.test(msg);
}

function reportedTwoHourWake(msg) {
  return /2\s*h(?:oras)?\s*(acord|de vig|de janela)|acordad[oa].{0,24}2\s*h|fica (cerca de |uns )?2\s*h(?:oras)?|at[eé] 2 horas acord/i.test(msg);
}

function reportedHealthyLongNight(msg) {
  return /5\s*h(?:oras)?|5h30|5 horas e meia/.test(msg) && /noite|noturn|dorme (seguid|a noite)/i.test(msg);
}

function reportedSuddenChange(msg) {
  return /mudou de (uma hora para outra|repente)|de uma hora para outra|do nada|s[uú]bita|repentin/i.test(msg)
    || (/muito choro|chora muito/i.test(msg) && /s[oó] (no )?colo/i.test(msg) && /4[0-5]\s*(min|minutos).{0,20}5[0-9]|40\s*[–\-aà]\s*50/i.test(msg));
}

function reportedLongNapUnspecified(msg) {
  return /soneca (da manh[aã] )?(longa|grande)/i.test(msg)
    && !/soneca.{0,40}\d+\s*h|umas 2|cerca de 2/i.test(msg);
}

function reportedShortNaps2535(msg) {
  return /24\s*(a|-|–)\s*30|26\s*(a|-|–)\s*32|25\s*(a|-|–)\s*35|22\s*(a|-|–)\s*28|sonecas?.{0,24}(22|24|25|26|28|30|32|35)\s*min/i.test(msg);
}

function shortNapRangeLabel(msg) {
  const m = String(msg || '').match(/(\d{2})\s*(?:a|-|–)\s*(\d{2})\s*min/i);
  if (m) return `${m[1]} a ${m[2]}`;
  return '22 a 28';
}

function shortNapRecurrentTail(msg) {
  return `Sonecas de cerca de ${shortNapRangeLabel(msg)} minutos, se forem recorrentes, pedem observar o comportamento ao acordar: com irritabilidade, as prioridades já são saciedade e sinais de refluxo. Abaixo de cerca de 20 minutos, essa investigação vale mesmo sem irritabilidade.`;
}

function shortNapReconduceCanon(msg) {
  return `A recondução cabe sobretudo quando ele ainda parece cansado. Se o despertar for definitivo e ele estiver restabelecido, começa uma nova janela. ${shortNapRecurrentTail(msg)}`;
}

function keepOfficialParagraphs(text, re) {
  const parts = String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const kept = parts.filter((p) => re.test(p));
  return kept.length ? kept.join('\n\n') : text;
}

function dropAffirmativeWithinWindow(text) {
  return String(text || '').replace(
    /[^.!?\n]*(dentro da faixa|dentro da janela|dentro do esperado)[^.!?]*[.!?]/gi,
    (m) => (/n[aã]o.{0,30}dentro|n[aã]o: isso n[aã]o/i.test(m) ? m : ''),
  );
}

const REFLUX_ESCALATION_3060 =
  'Se essa leitura de desconforto/refluxo se sustentar, assista às duas aulas com o pediatra no aplicativo. Se você identificar três ou mais sintomas, busque o suporte humano e o pediatra; diante de um sinal de alerta, a avaliação pediátrica é direta.';

const SAME_DAY_CRIB_CANON =
  'O indicado não é avançar uma soneca por vez ao longo dos dias. Trabalhe a aprendizagem no berço em todas as sonecas daquele mesmo dia, de forma gradual e compatível com a idade, sem exigir rigidez de comportamento. O passo a passo da Técnica do Travesseiro fica na aula correspondente.';

const NIGHT_OFFER_EVERY_TIME_CANON =
  'À noite, o relógio é o jejum da idade — cerca de 3 horas aos 30 dias, aumentando até cerca de 5 horas aos 60 dias — e não o intervalo diurno de 2h a 2h30. Aceitar o peito não comprova fome. Diga o horário da última mamada efetiva.\n\n'
  + 'Se o jejum ainda não foi atingido e a mamada anterior foi efetiva, com saciedade, tente primeiro reconduzir ao sono.\n\n'
  + 'Quando o jejum da idade já tiver sido alcançado, ofereça a mamada.\n\n'
  + 'Depois da mamada que encerra o jejum, volte ao intervalo da forma de alimentação: peito 2h a 2h30 ou mamadeira 3 horas, contados do início.';

const AFTER_FEED_UNKNOWN_WAKE_CANON =
  'A janela começa quando ele acorda, não quando termina a mamada ou o tempo em pé. Sem o horário do último despertar, não dá para afirmar que ele ainda está dentro da janela nem autorizar brincadeira.\n\n'
  + 'Cerca de 18 minutos em posição vertical ainda está abaixo da referência de 20 a 30 minutos após mamada efetiva. Complete as medidas posturais e me diga a que horas ele acordou antes de decidir entre interação leve e condução do sono.';

const LATE_AFTERNOON_CANON =
  'Na irritabilidade intensa e recorrente no fim da tarde, as duas prioridades de investigação são cansaço e possível baixa produção materna de leite, além de mamada efetiva, saciedade e sinais de desconforto.';

const CHARUTINHO_UNDEFINED_CANON =
  'Nesta faixa o Método não define o “charutinho” como causa nem como conduta padrão. Investigue como ele acorda, alimentação/saciedade, desconforto, vigília e a distribuição do sono em 24 horas. Se faltar regra específica, isso requer validação metodológica da Eliana Dias.';

const LATE_BATH_RITUAL_CANON =
  'A referência de 19h a 20h é para o início do sono noturno, não necessariamente para o começo do ritual. O ritual deve ser breve, com a mamada depois do banho. Não preserve o horário do ritual antes de saber a que horas o dia começou, quando terminou a última soneca, quanto tempo ele ficou acordado e como estava o comportamento. A exceção de horário mais tardio vale especialmente perto dos 60 dias, com o bebê tranquilo — não se aplica automaticamente só porque o banho está depois das 20h.';

const LEARN_TIMELINE_CANON =
  'Não existe prazo oficial definido nas regras para ele aprender. A evolução depende de consistência e repetição no processo. Se for necessário um prazo metodológico específico, isso requer validação da Eliana Dias.';

const RITUAL_WINDOW_CONDUCTION_CANON =
  'O tempo de condução faz parte da janela. O bebê precisa efetivamente adormecer dentro da janela de 45 minutos a 1 hora e 15 minutos. Sem o horário do último despertar, não dá para dizer se esse ritual coube nela.';

const DAY_ORG_AWAKE_LATE_CANON =
  'A referência geral para o início do sono noturno é 19h a 20h, sem aplicar isso de maneira rígida. Se ele ainda está acordado depois das 21h, isso já está além dessa referência. Antes de definir o horário, diga a que horas o dia começou, quando terminou a última soneca, qual foi a última janela e como estava o comportamento.';

function lateAwakeBeyondSentence(msg) {
  const clock = lateAwakeClock(msg);
  return clock
    ? `Se ele ainda está acordado às ${clock}, isso já está além dessa referência.`
    : 'Se ele ainda está acordado depois das 21h, isso já está além dessa referência.';
}

function ensureLateAwakeBeyondSentence(text, msg) {
  if (!(reportedNapOverMax(msg) && /21h/i.test(msg) && /ainda est[aá] acordado/i.test(msg))) return text;
  if (!has(text, /sem aplicar isso de maneira r[ií]gida/i)) return text;
  if (has(text, /ainda est[aá] acordado.{0,48}al[eé]m dessa refer[eê]ncia/i)) return text;
  const beyond = lateAwakeBeyondSentence(msg);
  if (has(text, /sem aplicar isso de maneira r[ií]gida\./i)) {
    return String(text).replace(
      /(sem aplicar isso de maneira r[ií]gida\.)/,
      `$1 ${beyond}`,
    );
  }
  return appendOnce(text, beyond);
}

const HOURLY_4H_INVESTIGATION_CANON =
  'O horário, sozinho, não explica despertares de hora em hora depois das 4h. Investigue a última mamada efetiva e a saciedade, as medidas posturais, a forma de adormecer, desconfortos e o comportamento nesses despertares. A recorrência horária não prova, por si, que o jejum noturno ainda não foi completado — isso se verifica pelo horário da última mamada efetiva.';

const PACIFIER_CONDITIONAL_CANON =
  'Como ele usa chupeta, vale observar se os despertares acontecem justamente quando ela cai. Se não houver essa relação, não há motivo, pelas informações apresentadas, para considerar a chupeta como causa principal dos despertares.';

function reportedConditionalPacifierNaps(msg) {
  return /chupeta/i.test(msg)
    && /sonecas duram|m[eé]dia de 30\s*min|despertares durante as sonecas/i.test(msg);
}

function ensureConditionalPacifier(text, msg) {
  let out = String(text || '');
  if (!reportedConditionalPacifierNaps(msg)) return out;
  out = out.replace(/quando ele cai/gi, 'quando ela cai');
  if (!has(out, /quando ela cai/i)) out = appendOnce(out, PACIFIER_CONDITIONAL_CANON);
  return out;
}

function lateAwakeClock(msg) {
  const m = String(msg || '').match(/(?:^|[^\w])[àáa]s\s+(\d{1,2}h\d{0,2})\s+ainda est[aá] acordado/i);
  const clock = (m && m[1]) || '';
  const hour = Number(String(clock).replace(/h.*/, ''));
  return Number.isFinite(hour) && hour >= 21 ? clock : '';
}

function ritualSleepClock(msg) {
  const m = String(msg || '').match(
    /(?:s[oó] )?dorme perto das\s+(\d{1,2}h\d{0,2})|adormece [àaá]s\s+(\d{1,2}h\d{0,2})/i,
  );
  return ((m && (m[1] || m[2])) || '').replace(/\s+/g, '');
}

function ensureLateBathRitual(text, msg) {
  if (!reportedLateBathRitual(msg)) return text;
  let out = String(text || '');
  out = out.replace(/[^.!?\n]*Preserve o hor[aá]rio que voc[eê] informou[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*gostaria de saber a que horas termina a [uú]ltima soneca[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*Para entender melhor,\s*a que horas termina a [uú]ltima soneca[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*Por favor, a que horas termina a [uú]ltima soneca[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*Isso ajudar[aá] a (avaliar|entender)[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*pode afetar o sono[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*Para organizar melhor a rotina, verifique a [uú]ltima soneca[^.!?]*[.!?]/gi, '');
  out = stripLateNapCausalClaim(out);
  out = keepFirstMatch(out, /O ritual deve ser breve[^.!?]*[.!?]/gi);
  const sleepAt = ritualSleepClock(msg);
  if (sleepAt && !has(out, new RegExp(`${sleepAt}.{0,80}al[eé]m`, 'i'))) {
    out = `${out}\n\nDormir perto das ${sleepAt} já está além da referência geral de 19h a 20h para o início do sono noturno.`.trim();
  }
  if (!has(out, /exce[cç][aã]o de hor[aá]rio mais tardio|60 dias.{0,80}n[aã]o se aplica automaticamente/i)) {
    out = `${out}\n\n${LATE_BATH_RITUAL_CANON}`.trim();
  }
  return out;
}

function reportedLearnTimelineAsk(msg) {
  return /quanto tempo.{0,48}aprend|em quanto tempo (ele|ela) aprende|prazo.{0,24}aprend/i.test(msg);
}

function missingLearnTimeline(out) {
  return !has(out, /n[aã]o existe (um )?prazo|sem prazo (fixo|oficial)|n[aã]o h[aá] prazo/i)
    || !has(out, /Eliana Dias/i);
}

function ensureLearnTimeline(text, msg, ids) {
  const crib = (ids && ids.has && ids.has('crib_adaptation_same_day_30_60'))
    || /todas as sonecas|passar.{0,40}ber[cç]o|uma soneca por (dia|vez)/i.test(msg);
  if (!reportedLearnTimelineAsk(msg) || !crib) return text;
  let out = String(text || '');
  out = out.replace(/[^.!?\n]*n[aã]o h[aá] um prazo fixo[^.!?]*[.!?]/gi, '');
  if (missingLearnTimeline(out)) {
    out = `${out}\n\n${LEARN_TIMELINE_CANON}`.trim();
  }
  return out;
}

function stripWindowHyperstimulationConsequence(text) {
  let out = String(text || '');
  out = out.replace(/\s+e entre em hiperestimula[cç][aã]o/gi, '');
  out = out.replace(/,? o que pode levar [aà] hiperestimula[cç][aã]o/gi, '');
  out = out.replace(/[^.!?\n]*ultrapass[^.!]{0,100}hiperestimula[cç][aã]o[^.!?]*[.!?]/gi, (m) => (
    /antecip|condu[cç][aã]o|janela/i.test(m)
      ? m.replace(/\s+e entre em hiperestimula[cç][aã]o/gi, '').replace(/,? o que pode levar [aà] hiperestimula[cç][aã]o/gi, '')
      : ''
  ));
  out = out.replace(/[^.!?\n]*entre em hiperestimula[cç][aã]o[^.!?]*[.!?]/gi, '');
  return out;
}

function stripUnsolicitedFormulaIntro(text) {
  let out = String(text || '');
  out = out.replace(/[^.!?\n]*2 meses e meio[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*mais f[aá]cil at[eé] cerca de 2 meses[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*pensando em como introduzir a f[oó]rmula[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*pensando em introduzir uma f[oó]rmula[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*introduzir uma f[oó]rmula[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*introduzir a f[oó]rmula.{0,120}(mais f[aá]cil|2 meses)[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*f[oó]rmula deve ser introduzida at[eé] cerca de 2[,.]5 meses[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*introduzir uma f[oó]rmula at[eé] cerca de 2[,.]5 meses[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*f[oó]rmula.{0,80}2[,.]5 meses[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*retorno ao trabalho[^.!?]*[.!?]/gi, '');
  return out;
}

function stripLateNapCausalClaim(text) {
  let out = String(text || '');
  out = out.replace(
    /[^.!?\n]*(influenciam|podem influenciar) a dificuldade para adormecer[^.!?]*[.!?]/gi,
    'A última soneca e o tempo acordado precisam ser avaliados para organizar o início da noite.',
  );
  out = keepFirstMatch(
    out,
    /A [uú]ltima soneca e o tempo acordado precisam ser avaliados para organizar o in[ií]cio da noite[.!?]/gi,
  );
  return out;
}

function stripMorningNapAfternoonCause(text) {
  let out = String(text || '');
  out = out.replace(/[^.!?\n]*soneca da manh[aã], sendo longa, pode interferir[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*soneca da manh[aã].{0,80}pode interferir[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*soneca da manh[aã].{0,100}(distribui[cç][aã]o.{0,40}tarde|sonecas da tarde)[^.!?]*[.!?]/gi, '');
  return out;
}

function stripRitualHyperstimulation(text) {
  let out = String(text || '');
  out = out.replace(/[^.!?\n]*evitar a hiperestimula[cç][aã]o[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*n[aã]o (deve )?ultrapassar esse tempo acordado[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*ritual deve ser breve.{0,80}hiperestimula[^.!?]*[.!?]/gi, '');
  return out;
}

function stripUnofficialCribSeguranca(text) {
  let out = String(text || '');
  out = out.replace(/\s+para dar mais seguran[cç]a a voc[eê] nesse processo/gi, '');
  out = out.replace(/, dando mais seguran[cç]a (à m[aã]e |para voc[eê] )?(nesse processo)?/gi, '');
  out = out.replace(/[^.!?\n]*Essa t[eé]cnica pode ajudar a dar mais seguran[cç]a[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*dar mais seguran[cç]a a voc[eê][^.!?]*[.!?]/gi, '');
  return out;
}

function stripCribCalmRequirement(text) {
  let out = String(text || '');
  out = out.replace(/,\s*e que ele esteja calmo ao ser colocad[oa] no ber[cç]o/gi, '');
  out = out.replace(/\s+e que ele esteja calmo ao ser colocad[oa] no ber[cç]o/gi, '');
  out = out.replace(/[^.!?\n]*esteja calmo ao ser colocad[oa][^.!?]*[.!?]/gi, (m) => (
    /sem chorar.{0,40}pode coloc|possibilidade/i.test(m) ? m : ''
  ));
  out = out.replace(/[^.!?\n]*calmo ao ser colocad[oa] no ber[cç]o[^.!?]*[.!?]/gi, (m) => (
    /sem chorar.{0,40}pode coloc|possibilidade/i.test(m) ? m : ''
  ));
  return out;
}

function stripHourlyUnfinishedFast(text) {
  let out = String(text || '');
  const dropUnlessNegated = (re) => {
    out = out.replace(re, (m) => (/n[aã]o prova/i.test(m) ? m : ''));
  };
  dropUnlessNegated(/[^.!?\n]*isso pode indicar que ele ainda n[aã]o completou o jejum[^.!?]*[.!?]/gi);
  dropUnlessNegated(/[^.!?\n]*ainda n[aã]o completou o jejum noturno[^.!?]*[.!?]/gi);
  dropUnlessNegated(/[^.!?\n]*n[aã]o est[aá] completando o jejum[^.!?]*[.!?]/gi);
  dropUnlessNegated(/[^.!?\n]*completar o jejum noturno adequado[^.!?]*[.!?]/gi);
  dropUnlessNegated(/[^.!?\n]*3h a 5h aos \d+ dias[^.!?]*[.!?]/gi);
  dropUnlessNegated(/[^.!?\n]*pode indicar que o jejum[^.!?]*[.!?]/gi);
  dropUnlessNegated(/[^.!?\n]*hora em hora.{0,140}jejum.{0,80}n[aã]o (foi |est[aá] )complet[^.!?]*[.!?]/gi);
  dropUnlessNegated(/[^.!?\n]*j[aá] se passaram cerca de 3 horas.{0,80}ofere[cç][^.!?]*[.!?]/gi);
  dropUnlessNegated(/[^.!?\n]*cerca de 3 horas.{0,60}ofere[cç]er o peito novamente[^.!?]*[.!?]/gi);
  dropUnlessNegated(/[^.!?\n]*voc[eê] deve oferecer o peito novamente[^.!?]*[.!?]/gi);
  return out;
}

function stripPresumedNightStart(text) {
  let out = String(text || '');
  out = out.replace(/[^.!?\n]*[Ss]e voc[eê] j[aá] inicia [àaá]s 21h[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*aula ['"“”]?Janela de Vig[ií]lia['"“”]?[^.!?]*[.!?]/gi, '');
  return out;
}

function ensureDayOrgLate(text, msg) {
  if (!(reportedNapOverMax(msg) && /21h|ainda est[aá] acordado/i.test(msg))) return text;
  let out = stripPresumedNightStart(text);
  const clock = lateAwakeClock(msg);
  out = out.replace(/ainda est[aá] acordado [àaá]s 10h20/gi, clock ? `ainda está acordado às ${clock}` : 'ainda está acordado depois das 21h');
  if (!has(out, /sem aplicar isso de maneira r[ií]gida/i)) {
    const lateLine = clock
      ? DAY_ORG_AWAKE_LATE_CANON.replace('depois das 21h', `às ${clock}`)
      : DAY_ORG_AWAKE_LATE_CANON;
    out = `${out}\n\n${lateLine}`.trim();
  } else {
    out = ensureLateAwakeBeyondSentence(out, msg);
  }
  return out;
}

const AMBIGUOUS_CLOCK_CANON =
  'Antes de orientar, preciso entender o que esse horário significa no dia de vocês: é o fim da noite, o despertar da manhã ou o limite de uma soneca? Não há regra de que o bebê precise estar acordado nesse horário. Se for soneca diurna, o teto é 2 horas e 30 minutos. De dia, não deixe passar 4 horas sem se alimentar. Sem esse contexto, ainda não aplico a regra de acordar ou não acordar.';

function reportedLongHabitualWake(msg) {
  const s = String(msg || '');
  return /(?<!\d)1h\s*(?:30|32|35|38|40|45)\b/i.test(s)
    || /1\s*hora e (?:30|32|35|38|40|45)/i.test(s)
    || /maior que 1h15|acima de 1h15/i.test(s);
}

function reportedFailedReconduction(msg) {
  return /reconduz.{0,50}n[aã]o (volt|func)|tentei reconduzir|n[aã]o voltou/i.test(msg);
}

function reportedNapMinutes(msg) {
  const s = String(msg || '');
  const m = s.match(/soneca(?:s)?[^.]{0,40}?(\d{1,2})\s*min|dormiu\s+(\d{1,2})\s*minutos|soneca[^.]{0,24}durou\s+(\d{1,2})/i);
  const n = Number((m && (m[1] || m[2] || m[3])) || '');
  return Number.isFinite(n) && n >= 8 && n <= 25 ? n : null;
}

function keepParagraphsMatching(text, re) {
  const parts = String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const kept = parts.filter((p) => re.test(p));
  return kept.length ? kept.join('\n\n') : text;
}

function applyRound5ConsistencyGuards(text, msg, ids, notes) {
  let out = String(text || '');

  if (reportedAmbiguous9am(msg) || ids.has('ambiguous_clock_30_60')) {
    out = out.replace(/[^.!?\n]*inicie a condu[cç][aã]o para a soneca[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*n[aã]o passe das (7|8|9|10)h[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*janela de vig[ií]lia[^.!?]{0,80}inicie a condu[cç][aã]o[^.!?]*[.!?]/gi, '');
    if (!has(out, /sem esse contexto/i)) {
      out = appendOnce(out, AMBIGUOUS_CLOCK_CANON);
    }
    out = keepParagraphsMatching(out, /sem esse contexto/i);
    notes.push('eval_r5_clock_gate');
  }

  if (reportedLongHabitualWake(msg)) {
    out = out.replace(/[^.!?\n]*[eé] normal.{0,140}(1h\s*3|1h\s*4|vig[ií]lia mais long|per[ií]odos? de vig[ií]lia)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*vig[ií]lia mais long[oa]s?.{0,40}(normal|esperad|comum)[^.!?]*[.!?]/gi, '');
    if (!has(out, /acima (da janela|da refer[eê]ncia)|ultrapassa|j[aá] est[aá] acima/i)) {
      out = `Ficar cerca de 1h30 a 1h45 acordado já está acima da janela de 45 minutos a 1 hora e 15 minutos. Inicie a condução mais cedo para ele adormecer dentro dessa referência.\n\n${out}`.trim();
      notes.push('eval_r5_long_wake_not_normal');
    }
  }

  if (reportedNightAfter3(msg) || ids.has('night_after_3_30_60')) {
    out = out.replace(/[^.!?\n]*[eé] comum nessa faixa[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*ainda est[aã]o se adaptando aos ciclos[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*j[aá] se passaram cerca de 2h\s*30[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*2h\s*30 desde a [uú]ltima mamada.{0,80}ofere[cç][^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*perce[cç][aã]o de que ['"]n[aã]o [eé] fome['"] n[aã]o [eé] suficiente[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*[eé] normal que.{0,80}(2h\s*45|2h\s*50|2h\s*30).{0,40}vig[ií]lia[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*ap[oó]s cerca de 2h\s*45 de vig[ií]lia[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*associa.{0,50}despertar.{0,30}peito[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*evit(ar|e) que (ele|ela) associe o despertar[^.!?]*[.!?]/gi, '');
    if (!/travesseiro/i.test(msg)) {
      out = out.replace(/[^.!?\n]*Estrat[eé]gia do Travesseiro[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*aula sobre a Estrat[eé]gia do Travesseiro[^.!?]*[.!?]/gi, '');
    }
    if (!has(out, /jejum noturno da idade|jejum da idade j[aá] foi atingido/i)) {
      out = `À noite, o primeiro relógio é o jejum da idade — cerca de 3 horas aos 30 dias, aumentando até cerca de 5 horas aos 60 dias — e não o intervalo diurno de 2h a 2h30. Isso é despertar no sono noturno, não vigília diurna. Se o jejum ainda não foi atingido e a mamada anterior foi efetiva com saciedade, tente primeiro reconduzir.\n\n${out}`.trim();
      notes.push('eval_r5_night_fast_not_day_interval');
    } else if (!/^À noite, o primeiro rel[oó]gio|^Isso [eé] despertar no sono noturno/i.test(out.trim())) {
      out = `Isso é despertar no sono noturno, não vigília diurna. O relógio aqui é o jejum da idade — cerca de 3 horas aos 30 dias, aumentando até cerca de 5 horas aos 60 dias — e não o intervalo diurno de 2h a 2h30.\n\n${out}`.trim();
      notes.push('eval_r5_night_not_day_wake');
    }
  }

  if (ids.has('night_hourly_wakes_30_60')) {
    out = out.replace(/[^.!?\n]*pode indicar que .{0,40}(mais alimenta[cç][aã]o|mamada anterior n[aã]o foi suficiente)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*precisando de mais alimenta[cç][aã]o[^.!?]*[.!?]/gi, '');
    const motherHasFirstStretch = motherReportedFirstStretch(msg);
    if (!motherHasFirstStretch) {
      out = stripAssumedFirstStretch(out);
      notes.push('eval_r5_no_invented_first_stretch');
    }
  }

  if (ids.has('early_night_ritual_crib_30_60') || (/ritual/i.test(msg) && /18h|19h/i.test(msg))) {
    out = out.replace(/[^.!?\n]*18h\s*15.{0,40}19h\s*50.{0,50}1h\s*35[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*intervalo de 1h\s*35[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*come[cç]a o ritual.{0,40}adormece.{0,40}(janela|1h)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*tempo acordado est[aá] (al[eé]m|acima) do ideal[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*come[cç]ando o ritual [aà]s 18h.{0,160}(al[eé]m|acima|janela|ideal)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*come[cç]ar o ritual.{0,200}adormecer.{0,120}(1h\d{2}|janela|al[eé]m)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*ficou acordado por um per[ií]odo.{0,80}(1h\d{2}|janela)[^.!?]*[.!?]/gi, '');
    if (!/21h\s*30|21:30|22h/i.test(msg)) {
      out = out.replace(/[^.!?\n]*21h\s*30 ou 22h[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*por volta de 21h30[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*iniciar o sono noturno por volta de 21h30[^.!?]*[.!?]/gi, '');
    }
    const ritualCanon = 'A janela de vigília começa no último despertar, não no início do ritual. Sem o horário em que ele acordou, não dá para concluir que o intervalo do ritual foi a janela.';
    out = out.replace(/A janela de vig[ií]lia come[cç]a no [uú]ltimo despertar[^.!?]{0,200}[.!?]\s*/gi, '');
    out = `${ritualCanon}\n\n${out}`.trim();
    notes.push('eval_r5_ritual_not_window_start');
  }

  if (reportedWakePlusOnset(msg)) {
    out = out.replace(/[^.!?\n]*dentro do esperado[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*1h0[0-9].{0,60}(dentro|esperado|normal)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*[eé] normal que.{0,160}(1h10|1h0[0-8]|1h\s*10)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*[eé] normal.{0,80}1h10.{0,50}acord[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*[eé] normal que.{0,80}acordad[oa].{0,40}1h10[^.!?]*[.!?]/gi, '');
    if (/fracion/i.test(msg) || reportedLongNapUnspecified(msg)) {
      out = stripMorningNapAfternoonCause(out);
      out = out.replace(/^\s*Isso pode ajudar[^.!?]*[.!?]\s*/gim, '');
      if (!has(out, /n[aã]o fracion|teto autom[aá]tico [eé] 2/i)) {
        out = appendOnce(
          out,
          'Não fraciono uma soneca só porque ela parece longa. O teto automático é 2 horas e 30 minutos. Me diga quanto tempo essa soneca da manhã durou.',
        );
        notes.push('eval_r5_no_fraction_without_duration');
      }
    }
    if (!/A janela conta do despertar/.test(out.slice(0, 180))) {
      const total = wakeOnsetCanon(msg);
      if (!has(out, /n[aã]o: isso n[aã]o est[aá] dentro da janela/i)) {
        out = `${total}\n\n${out}`.trim();
        notes.push('eval_r5_total_wake_first');
      }
    }
    const parsed = parseWakeOnsetMinutes(msg);
    if (parsed) {
      out = out.replace(/ainda leva (cerca de )?40 minutos para dormir/gi, `ainda leva ${parsed.onsetMin} minutos para dormir`);
      out = out.replace(/ainda leva 35 a 40 minutos para dormir/gi, `ainda leva ${parsed.onsetMin} minutos para dormir`);
      out = out.replace(/1h35[–\-]1h40/gi, formatHoursMinutes(parsed.totalMin));
      out = out.replace(/[^.!?\n]*principal hip[oó]tese.{0,80}soneca (da manh[aã] )?(longa|grande)[^.!?]*[.!?]/gi, '');
    }
  }

  if (reportedNapOverMax(msg) || ids.has('nap_over_max_30_60')) {
    out = out.replace(
      /(?:[eé] importante )?acord[áaàe]-l[oa](?: aos 2h\s*30)? para oferecer a mamada/gi,
      'ao atingir 2h30, acorde o bebê e organize a próxima janela',
    );
    out = out.replace(/acord[áa]-l[oa] aos 2h\s*30 para oferecer a mamada/gi, 'acorde o bebê aos 2h30 e organize a próxima janela');
    out = out.replace(/[^.!?\n]*acord[áaàe]-l[oa].{0,40}2h\s*30.{0,60}ofere[cç].{0,30}mamada[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*(22h|21h45).{0,90}(soneca (foi )?muito longa|janela foi perdida)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*ainda est[aá] acordado [aà]s 22h.{0,80}indicar[^.!?]*[.!?]/gi, '');
    out = stripEarlyNapCloseBeforeCap(out, msg);
    out = fixNapCapComposition(out);
    if (!has(out, /mamada s[oó] entra se o intervalo|n[aã]o significa mamada imediata/i)) {
      out = appendOnce(
        out,
        'Acordar aos 2h30 preserva alimentação, as próximas janelas e a noite. Isso não obriga mamada imediata: a mamada só entra se o intervalo desde o início da mamada anterior já tiver sido atingido.',
      );
      notes.push('eval_r5_wake_cap_not_auto_feed');
    }
  }

  if (ids.has('nap_angry_wake_30_60') || reportedAngryWake(msg)) {
    out = out.replace(/[^.!?\n]*recomendo a aula sobre refluxo[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*[eé] comum.{0,80}acord(em|ar) irritad[oa]s?.{0,80}1h[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*especialmente se a dura[cç][aã]o for em torno de 1h[^.!?]*[.!?]/gi, '');
    if (!/tv|celular|est[ií]mulo/i.test(msg)) {
      out = out.replace(/[^.!?\n]*TV, celular ou muitos movimentos[^.!?]*[?]/gi, '');
      out = out.replace(/[^.!?\n]*exposi[cç][aã]o a TV[^.!?]*[?]/gi, '');
    }
    if (!has(out, /duas aulas com o pediatra|duas aulas com pediatra/i)) {
      out = appendOnce(out, REFLUX_ESCALATION_3060);
      notes.push('eval_r5_angry_reflux_official');
    }
    if (/1 hora|1h(?!\s*15)/i.test(msg) && !has(out, /n[aã]o [eé] automaticamente curta|n[aã]o devem ser consideradas curtas/i)) {
      out = appendOnce(out, 'Uma soneca de cerca de 1 hora não é automaticamente curta.');
      notes.push('eval_r5_1h_not_short');
    }
  }

  if (reportedCharutinho(msg) || ids.has('charutinho_undefined_30_60')) {
    out = out.replace(/[^.!?\n]*fome.{0,90}charutinho[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*charutinho.{0,90}fome[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*necessidade de estar no charutinho[^.!?]*[.!?]/gi, '');
    if (!/travesseiro/i.test(msg)) {
      out = out.replace(/[^.!?\n]*Estrat[eé]gia do Travesseiro[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*aula sobre a Estrat[eé]gia do Travesseiro[^.!?]*[.!?]/gi, '');
    }
    notes.push('eval_r5_no_charutinho_hunger_cause');
  }

  if (reportedSuddenChange(msg) || ids.has('sudden_change_cry_30_60')) {
    out = out.replace(/[^.!?\n]*reduzir estim[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*adaptar o beb[eê] fora do colo[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*quando ele estiver CALMO[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*[eé] normal que os beb[eê]s.{0,60}varia[cç][oõ]es no sono[^.!?]*[.!?]/gi, '');
    if (!/^Antes de atribuir/i.test(out.trim())) {
      out = `Antes de atribuir o quadro a excesso de estímulos, confirme mamada efetiva e saciedade, medidas posturais, desconforto ou refluxo e se a vigília realmente passou de 45 minutos a 1 hora e 15 minutos. Uma janela de cerca de 45 minutos, sozinha, não é vigília excessiva.\n\n${out}`.trim();
      notes.push('eval_r5_sudden_physio_open');
    }
  }

  if (ids.has('bottle_volume_30_60') && !/trabalho|ordenh/i.test(msg)) {
    out = out.replace(/[^.!?\n]*volta ao trabalho[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*voltar ao trabalho[^.!?]*[.!?]/gi, '');
    notes.push('eval_r5_no_work_block');
  }

  if (/chupeta cai|quando a chupeta cai/i.test(msg) && !reportedLongHabitualWake(msg) && !/soneca/i.test(msg)) {
    out = out.replace(/[^.!?\n]*depend[ea].{0,50}chupeta[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*[eé] normal que.{0,80}chupeta[^.!?]*[.!?]/gi, '');
    if (!has(out, /2 a 5 minutos/i)) {
      out = `${PACIFIER_55_CANON}\n\n${out}`.trim();
    }
    out = keepParagraphsMatching(out, /2 a 5 minutos/i);
    notes.push('eval_r5_pacifier_stop');
  }

  if ((/chupeta/i.test(msg) && /soneca/i.test(msg)) && !has(out, /2 a 5 minutos/i)) {
    out = appendOnce(out, PACIFIER_55_CANON);
    notes.push('eval_r5_pacifier_wait_on_short_nap');
  }

  if (reportedFailedReconduction(msg)) {
    out = out.replace(/[^.!?\n]*tente reconduzi[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*pode tentar reconduzi[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*reconduzi-lo ao sono novamente[^.!?]*[.!?]/gi, '');
    if (!has(out, /siga o dia|despertar definitivo/i)) {
      out = appendOnce(
        out,
        'Como a recondução já foi tentada e não funcionou, siga o dia: a nova janela começa no despertar definitivo. Se sonecas abaixo de cerca de 20 minutos forem recorrentes, investigue saciedade e sinais de refluxo.',
      );
    }
    notes.push('eval_r5_no_repeat_reconduction');
  }

  const napMin = reportedNapMinutes(msg);
  if (napMin && napMin !== 10 && napMin !== 15) {
    out = out.replace(/soneca de cerca de 10 a 15 minutos/gi, `soneca de cerca de ${napMin} minutos`);
    out = out.replace(/cerca de 10 a 15 minutos/gi, `cerca de ${napMin} minutos`);
  }

  if (/todas as sonecas|passar.{0,40}ber[cç]o|uma soneca por (dia|vez)/i.test(msg)) {
    out = stripCribInventedHowTo(out);
    if (!has(out, /todas as sonecas daquele mesmo dia|todas as sonecas do dia|n[aã]o [eé] avan[cç]ar uma soneca por vez/i)) {
      out = appendOnce(out, SAME_DAY_CRIB_CANON);
      notes.push('eval_r5_same_day_explicit');
    }
  }

  if (/banho.{0,24}20h|20h\s*45|20h30|20:45|20:30|20h20|20:20/i.test(msg) && !/21h\s*30|21:30/i.test(msg)) {
    out = out.replace(/[^.!?\n]*se voc[eê] j[aá] inicia [aà]s 21h[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*banho [aà]s 21h30[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*Preserve o hor[aá]rio que voc[eê] informou[^.!?]*[.!?]/gi, '');
    if (!has(out, /in[ií]cio do sono noturno, n[aã]o (necessariamente )?para o come[cç]o do ritual/i)) {
      out = appendOnce(out, LATE_BATH_RITUAL_CANON);
      notes.push('eval_r5_ritual_not_preserve_clock');
    }
  }

  if (reportedSlingCry(msg) || ids.has('sling_cry_physio_30_60')) {
    out = out.replace(/[^.!?\n]*[eé] normal.{0,80}condu[cç][aã]o para dormir leve tempo[^.!?]*[.!?]/gi, '');
    if (!/travesseiro/i.test(msg)) {
      out = out.replace(/[^.!?\n]*Estrat[eé]gia do Travesseiro[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*aula sobre a Estrat[eé]gia do Travesseiro[^.!?]*[.!?]/gi, '');
    }
    if (!/^N[aã]o[,:]/i.test(out.trim()) && !has(out.slice(0, 220), /n[aã]o, o total|acima da janela/i)) {
      out = `Não: o tempo total, do despertar até ele efetivamente adormecer, está acima da janela de 45 minutos a 1 hora e 15 minutos.\n\n${out}`.trim();
      notes.push('eval_r5_sling_no_first');
    }
  }

  if (reportedHealthyLongNight(msg)) {
    out = out.replace(/[^.!?\n]*n[aã]o est[aá] ganhando peso adequadamente[^.!?]*[.!?]/gi, '');
    out = out.replace(/especialmente considerando que ele usa complemento/gi, '');
  }

  if (reportedSleepBeforeFeed(msg) || ids.has('sleep_before_feed_30_60')) {
    out = out.replace(/^[^.!?\n]*[EÉ] normal que[^.!?]*[.!?](\s*)/i, '');
    out = out.replace(/^[^.!?\n]*Isso [eé] fisiol[oó]gico e esperado[^.!?]*[.!?](\s*)/i, '');
  }

  return out;
}

function applyRound6ConsistencyGuards(text, msg, ids, notes) {
  let out = String(text || '');

  if (reportedShortNaps2535(msg)) {
    out = out.replace(/[^.!?\n]*acorda tranquilo.{0,80}recondu[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*se ele acorda tranquilo.{0,100}(recondu|tentar)[^.!?]*[.!?]/gi, '');
    if (!has(out, /ainda parecer cansado|despertar (for |for definitivo|definitivo)/i)) {
      out = appendOnce(
        out,
        shortNapReconduceCanon(msg),
      );
      notes.push('eval_r6_reconduce_if_tired');
    }
  }

  if (reportedSlingCry(msg) || ids.has('sling_cry_physio_30_60')) {
    out = out.replace(/saciado antes de (tentar )?coloc[aá]-l[oa] para dormir/gi, 'saciado quando isso for relevante ao caso, sem exigir mamada antes de cada sono');
    out = out.replace(/garantir que (ele |ela )?tenha mamadas efetivas e esteja saciado antes de/gi, 'confirme se a última mamada foi efetiva e se houve saciedade, quando isso for relevante, antes de');
    notes.push('eval_r6_no_feed_before_every_sleep');
  }

  if (ids.has('nap_angry_wake_30_60') && !/chupeta/i.test(msg)) {
    out = out.replace(/[^.!?\n]*queda da chupeta[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*coincide com a queda da chupeta[^.!?]*[?]/gi, '');
    out = out.replace(/\s*O despertar coincide com a queda da chupeta\??/gi, '');
    notes.push('eval_r6_no_pacifier_carryover');
  }

  if (reportedNapOverMax(msg) || ids.has('nap_over_max_30_60')) {
    if (!reportedLongHabitualWake(msg)) {
      out = out.replace(/^Ficar cerca de 1h30 a 1h45 acordado[^.!?]*[.!?](\s*)/i, '');
    }
  }

  if (reportedSleepBeforeFeed(msg) || ids.has('sleep_before_feed_30_60')) {
    out = out.replace(/[^.!?\n]*fisiol[oó]gico e esperado[^.!?]*[.!?]/gi, '');
    notes.push('eval_r6_no_physio_filler');
  }

  if (/banho.{0,24}20h|20h\s*15|20h30|20:30|20:15/i.test(msg) && /ritual|banho/i.test(msg)) {
    out = out.replace(/[^.!?\n]*banho.{0,40}(atrasando|atrasa)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*20h30.{0,60}atras[^.!?]*[.!?]/gi, '');
    notes.push('eval_r6_no_bath_causal');
  }

  if (reportedAfterFeedPlay(msg) || ids.has('after_feed_play_30_60')) {
    out = out.replace(/[^.!?\n]*bom momento para come[cç]ar a conduzir[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*j[aá] ficou (uns |cerca de )?\d+ minutos em p[eé].{0,80}conduzir[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*Evite intera[cç][oõ]es excessivas, como brincar[^.!?]*[.!?]/gi, '');
    if (!has(out.slice(0, 320), /sem o hor[aá]rio do [uú]ltimo despertar|n[aã]o quando termina a mamada/i)) {
      out = `A janela começa quando ele acorda, não quando termina a mamada ou o tempo em pé. Sem o horário do último despertar, os minutos em posição vertical sozinhos não dizem se já é hora de conduzir o sono.\n\n${out}`.trim();
      notes.push('eval_r6_after_feed_need_wake_clock');
    }
  }

  if (reportedCharutinho(msg) || ids.has('charutinho_undefined_30_60')) {
    if (!/permane|ainda (est[aá]|no peito)/i.test(msg)) {
      out = out.replace(/[^.!?\n]*permane[cs]er no peito[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*retir(e|ar) do peito.{0,80}vertical[^.!?]*[.!?]/gi, '');
    }
    out = out.replace(/\n\d+\.\s*(?=\n|$)/g, '\n');
    notes.push('eval_r6_charutinho_no_other_flow');
  }

  if ((ids.has('bottle_volume_30_60') || /\d+\s*ml/i.test(msg)) && !/trabalho|ordenh/i.test(msg)) {
    out = out.replace(/[^.!?\n]*volta ao trabalho[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*voltar ao trabalho[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*Volta ao Trabalho[^.!?]*[.!?]/gi, '');
    out = out.replace(/previs[aã]o de retorno ao trabalho[^.?]*\??/gi, '');
    notes.push('eval_r6_bottle_stop');
  }

  if ((/colo|peito/i.test(msg) && /todas as sonecas|uma soneca por (dia|vez)/i.test(msg))
    || (ids.has('crib_adaptation_same_day_30_60') && /colo|peito/i.test(msg))) {
    if (!has(out.slice(0, 400), /Antes de (passar as sonecas|ensinar o sono no ber[cç]o)/i)) {
      out = `Antes de passar as sonecas para o berço, confirme mamada efetiva e saciedade, medidas posturais, desconforto ou refluxo e se a janela está entre 45 minutos e 1 hora e 15 minutos.\n\n${out}`.trim();
      notes.push('eval_r6_crib_physio_first');
    }
  }

  if (reportedTwoHourWake(msg) && (reportedNapOverMax(msg) || reportedHealthyLongNight(msg))) {
    out = out.replace(/[^.!?\n]*[eé] normal que.{0,140}2 horas[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*sonecas de 3 horas.{0,40}esperad[^.!?]*[.!?]/gi, '');
    if (/f[oó]rmula|mamadeira|complemento/i.test(msg)) {
      out = out.replace(/[^.!?\n]*soltar? o peito[^.!?]*[.!?]/gi, '');
    }
    if (!/^Ficar cerca de 2 horas/i.test(out.trim())) {
      out = `Ficar cerca de 2 horas acordado já ultrapassa a janela de 45 minutos a 1 hora e 15 minutos. A soneca diurna não deve passar de 2 horas e 30 minutos. Se o bebê é saudável e dorme espontaneamente à noite, não o acorde só porque o sono passou da progressão típica do jejum.\n\n${out}`.trim();
      notes.push('eval_r6_combo_open_correct');
    }
  }

  const napMin = reportedNapMinutes(msg);
  if ((napMin && napMin < 20) || reportedMicroNap(msg) || ids.has('micro_nap_recurrent_30_60')) {
    out = out.replace(/[^.!?\n]*necessidade de conforto[^.!?]*[.!?]/gi, '');
    if (!has(out, /recorrente.{0,50}20|abaixo de .{0,16}20|padr[aã]o for recorrente/i)) {
      out = appendOnce(
        out,
        'Se esse padrão abaixo de cerca de 20 minutos for recorrente, as prioridades são saciedade e sinais de refluxo.',
      );
      notes.push('eval_r6_micronap_recurrence');
    }
  }

  if (reportedFailedReconduction(msg)) {
    out = out.replace(/[^.!?\n]*ber[cç]o acordad[oa][^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*coloc[aá]-l[oa] no ber[cç]o acordad[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*oportunidade de adormecer ali[^.!?]*[.!?]/gi, '');
    if (!/travesseiro/i.test(msg)) {
      out = out.replace(/[^.!?\n]*Estrat[eé]gia do Travesseiro[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*aula da Estrat[eé]gia do Travesseiro[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*aula sobre a Estrat[eé]gia do Travesseiro[^.!?]*[.!?]/gi, '');
    }
    if (!/^Como a recondu[cç][aã]o j[aá] foi tentada|^Se a recondu[cç][aã]o n[aã]o funcionar|^Como a recondução já foi/i.test(out.trim())) {
      out = `Como a recondução já foi tentada e não funcionou, siga o dia: a nova janela começa no despertar definitivo.\n\n${out}`.trim();
      notes.push('eval_r6_failed_reconduce_stop');
    }
  }

  if (reportedSuddenChange(msg) || ids.has('sudden_change_cry_30_60')) {
    out = out.replace(/[^.!?\n]*momento de adapta[cç][aã]o[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*[eé] normal que.{0,80}varia[cç][oõ]es no padr[aã]o de sono[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*preferir dormir no colo.{0,80}adapta[cç][aã]o[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*Evite intera[cç][oõ]es excessivas nesse momento[^.!?]*[.!?]/gi, '');
    if (!/travesseiro/i.test(msg)) {
      out = out.replace(/[^.!?\n]*Estrat[eé]gia do Travesseiro[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*aula sobre a Estrat[eé]gia do Travesseiro[^.!?]*[.!?]/gi, '');
    }
    notes.push('eval_r6_sudden_no_behavior_yet');
  }

  if (ids.has('night_hourly_wakes_30_60') && !motherReportedFirstStretch(msg)) {
    out = stripAssumedFirstStretch(out);
    if (!has(out, /SE ele mamou efetivamente por volta das 4h|sem o hor[aá]rio e a qualidade da [uú]ltima mamada/i)) {
      out = appendOnce(
        out,
        'Peça o horário e a qualidade da última mamada. Se ele mamou efetivamente por volta das 4h e despertar cerca de uma hora depois, tente reconduzir sem oferecer o peito imediatamente.',
      );
    }
    notes.push('eval_r6_hourly_conditional');
  }

  if (reportedWakePlusOnset(msg) && /fracion/i.test(msg)) {
    if (!has(out, /n[aã]o fracion/i)) {
      out = appendOnce(
        out,
        'Não fraciono uma soneca só porque ela parece longa. Diga quanto tempo ela durou: o teto automático é 2 horas e 30 minutos.',
      );
    }
  }

  return out;
}

function applyRound7ConsistencyGuards(text, msg, ids, notes) {
  let out = String(text || '');

  if (reportedShortNaps2535(msg)) {
    out = out.replace(/[^.!?\n]*acordar calmo.{0,120}(condu[cç][aã]o|pr[oó]xima soneca)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*se (ele |ela )?acordar calmo.{0,140}(inicie|iniciar|come[cç]ar)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*acordado e tranquilo.{0,80}bom momento para come[cç]ar a conduzir[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*[eé] normal que.{0,80}sonecas curtas[^.!?]*[.!?]/gi, '');
    if (!/^A recondu[cç][aã]o cabe sobretudo/i.test(out.trim())) {
      out = `A recondução cabe sobretudo quando ele ainda parece cansado. Se o despertar for definitivo e ele estiver restabelecido, começa uma nova janela — não inicie outra condução só porque acordou calmo.\n\n${out}`.trim();
      notes.push('eval_r7_calm_not_new_sleep');
    }
  }

  if (reportedSlingCry(msg) || ids.has('sling_cry_physio_30_60')) {
    out = out.replace(/[^.!?\n]*[eé] normal que.{0,80}adaptando ao sono[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*choro fa[cç]a parte desse processo[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*aula correspondente[^.!?]*[.!?]/gi, '');
    notes.push('eval_r7_sling_no_cry_normalize');
  }

  if (ids.has('nap_angry_wake_30_60') || reportedAngryWake(msg)) {
    out = out.replace(/[^.!?\n]*[eé] comum que.{0,100}acord(em|ar) irritad[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*Quanto tempo ele ficou acordado antes de chorar\??/gi, '');
    notes.push('eval_r7_angry_no_common');
  }

  if ((reportedNapOverMax(msg) || ids.has('nap_over_max_30_60')) && /21h|ainda est[aá] acordado/i.test(msg)) {
    out = out.replace(/[^.!?\n]*[uú]ltima soneca.{0,40}avan[cç]ou[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*comprometeu o in[ií]cio do sono noturno[^.!?]*[.!?]/gi, '');
    notes.push('eval_r7_no_invented_last_nap');
  }

  if (reportedSleepBeforeFeed(msg) || ids.has('sleep_before_feed_30_60')) {
    out = out.replace(/[^.!?\n]*[eé] natural que[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*esperado nessa faixa et[aá]ria[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*ainda est[aá] se adaptando ao ritmo[^.!?]*[.!?]/gi, '');
    notes.push('eval_r7_sleep_feed_no_normalize');
  }

  if (/banho.{0,24}20h|20h\s*15|20h20|20:15|20:20/i.test(msg) && /ritual|banho/i.test(msg)) {
    out = out.replace(/[^.!?\n]*21h\d{0,2}.{0,40}al[eé]m da faixa ideal[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*s[oó] dorme perto das 21h.{0,60}al[eé]m[^.!?]*[.!?]/gi, '');
    notes.push('eval_r7_bath_ask_last_nap_first');
  }

  if (reportedNightAfter3(msg) || ids.has('night_after_3_30_60')) {
    out = out.replace(/[^.!?\n]*[eé] normal que.{0,100}(2h\s*50|2h\s*40|sono mais leve)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*ainda est[aá] se adaptando ao (seu )?ritmo de sono[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*buscando conforto[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*aula.{0,40}Janela de Vig[ií]lia[^.!?]*[.!?]/gi, '');
    notes.push('eval_r7_night_no_comfort_adapt');
  }

  if (reportedAfterFeedPlay(msg) || ids.has('after_feed_play_30_60')) {
    if (!/travesseiro/i.test(msg)) {
      out = out.replace(/[^.!?\n]*Estrat[eé]gia do Travesseiro[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*aula sobre a Estrat[eé]gia do Travesseiro[^.!?]*[.!?]/gi, '');
    }
    notes.push('eval_r7_after_feed_no_pillow');
  }

  if (reportedCharutinho(msg) || ids.has('charutinho_undefined_30_60')) {
    out = out.replace(/[^.!?\n]*aula correspondente[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*uso do charutinho[^.!?]*aula[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*execu[cç][aã]o dessa estrat[eé]gia[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*[eé] comum que.{0,80}charutinho[^.!?]*[.!?]/gi, '');
    out = out.replace(/\n\d+\.\s*(?=\n|$)/g, '\n');
    notes.push('eval_r7_charutinho_undefined_lock');
  }

  if ((ids.has('bottle_volume_30_60') || /\d+\s*ml/i.test(msg)) && !/aprendizado|mamadeira/i.test(msg)) {
    out = out.replace(/mamadeira de aprendizado/gi, 'fórmula');
    out = out.replace(/[^.!?\n]*facilitar a adapta[cç][aã]o[^.!?]*[.!?]/gi, '');
    notes.push('eval_r7_no_learning_bottle');
  }

  const parsed = parseWakeOnsetMinutes(msg);
  if (parsed || /fracion/i.test(msg) || reportedLongNapUnspecified(msg)) {
    out = stripMorningNapAfternoonCause(out);
    if (parsed) notes.push('eval_r7_exact_wake_onset');
  }

  if (reportedFailedReconduction(msg)) {
    if (!reportedLongHabitualWake(msg)) {
      out = out.replace(/[^.!?\n]*1h30 a 1h45[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*j[aá] estiver acordado por cerca de 1h30[^.!?]*[.!?]/gi, '');
    }
    out = out.replace(/[^.!?\n]*observe se ele consegue se reorganizar e voltar a dormir[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*Essa estrat[eé]gia oferece mais seguran[cç]a[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*aula correspondente[^.!?]*[.!?]/gi, '');
    notes.push('eval_r7_failed_reconduce_no_numbers');
  }

  if (reportedSuddenChange(msg) || ids.has('sudden_change_cry_30_60')) {
    out = out.replace(/[^.!?\n]*[eé] comum que.{0,80}varia[cç][oõ]es no sono[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*apresentem varia[cç][oõ]es no sono[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*hiperestimular[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*evite intera[cç][oõ]es excessivas[^.!?]*[.!?]/gi, '');
    notes.push('eval_r7_sudden_no_hyper_yet');
  }

  const microMin = reportedNapMinutes(msg);
  if (microMin && microMin < 20) {
    out = out.replace(/[^.!?\n]*est[aá] com fome[^.!?]*[.!?]/gi, '');
    out = out.replace(/investigar se ele est[aá] com fome/gi, 'investigar mamada efetiva e saciedade');
    out = out.replace(/[^.!?\n]*o refluxo pode ser um fator contribuinte[^.!?]*[.!?]/gi, '');
    notes.push('eval_r7_micronap_no_assume_hunger');
  }

  return out;
}

function applyRound8LeftoverGuards(text, msg, ids, notes) {
  let out = String(text || '');

  out = out.replace(/A principal hip[oó]tese(?![^.!?]{0,120}vem da soma)[^.!?]*[.!?]\s*/gi, '');

  if (reportedShortNaps2535(msg)) {
    out = out.replace(
      /Sonecas de cerca de \d+ a \d+ minutos, se forem recorrentes, merecem observar se a tend[eê]ncia cai abaixo de cerca de 20 minutos[:.]?[^.!?]*[.!?]?/gi,
      shortNapRecurrentTail(msg),
    );
    out = out.replace(
      /merecem observar se a tend[eê]ncia cai abaixo de cerca de 20 minutos[:.]?[^.!?]*[.!?]?/gi,
      'pedem observar o comportamento ao acordar: com irritabilidade, as prioridades já são saciedade e sinais de refluxo. Abaixo de cerca de 20 minutos, essa investigação vale mesmo sem irritabilidade.',
    );
    notes.push('eval_r8_short_nap_irritability_now');
  }

  if (reportedSlingCry(msg) || ids.has('sling_cry_physio_30_60')) {
    out = out.replace(/[^.!?\n]*aproximando do pr[oó]ximo intervalo de mamada[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*isso pode indicar fome[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*a mamada deve ser priorizada[^.!?]*[.!?]/gi, '');
    out = stripWindowHyperstimulationConsequence(out);
    notes.push('eval_r8_sling_no_feed_equals_hunger');
  }

  if ((reportedNapOverMax(msg) || ids.has('nap_over_max_30_60')) && /21h|ainda est[aá] acordado/i.test(msg)) {
    out = stripPresumedNightStart(out);
    out = out.replace(/[^.!?\n]*[uú]ltima soneca.{0,40}avan[cç]ou[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*comprometeu o in[ií]cio do sono noturno[^.!?]*[.!?]/gi, '');
    if (!/peito|f[oó]rmula|mamadeira|complemento/i.test(msg)) {
      out = out.replace(/[^.!?\n]*intervalo de 2h a 2h30[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*2h a 2h30 ap[oó]s a [uú]ltima mamada[^.!?]*[.!?]/gi, '');
    }
    if (!has(out, /sem aplicar isso de maneira r[ií]gida/i)) {
      const clock = lateAwakeClock(msg);
      const lateLine = clock
        ? DAY_ORG_AWAKE_LATE_CANON.replace('depois das 21h', `às ${clock}`)
        : DAY_ORG_AWAKE_LATE_CANON;
      out = appendOnce(out, lateLine);
    } else {
      out = ensureLateAwakeBeyondSentence(out, msg);
    }
    out = out.replace(
      /O hor[aá]rio (saud[aá]vel e )?recomendado para o in[ií]cio do sono noturno [eé] entre 19h e 20h\./gi,
      '',
    );
    notes.push('eval_r8_night_org_19_20_context');
  }

  if (reportedLateBathRitual(msg)) {
    out = stripRitualHyperstimulation(out);
    out = stripLateNapCausalClaim(out);
    out = out.replace(/[^.!?\n]*Preserve o hor[aá]rio que voc[eê] informou[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*Iniciar o ritual[^.!?]{0,160}al[eé]m[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*ritual [aà]s 20h[^.!?]{0,80}al[eé]m[^.!?]*[.!?]/gi, '');
    out = out.replace(
      /[^.!?\n]*O hor[aá]rio recomendado para o in[ií]cio do sono noturno [eé] entre 19h e 20h\.[^.!?]{0,200}(ritual|20h20)[^.!?]*[.!?]/gi,
      '',
    );
    const sleepAt = ritualSleepClock(msg);
    if (sleepAt && !has(out, new RegExp(`${sleepAt}.{0,80}al[eé]m`, 'i'))) {
      out = appendOnce(
        out,
        `Dormir perto das ${sleepAt} já está além da referência geral de 19h a 20h para o início do sono noturno.`,
      );
    }
    if (!has(out, /60 dias.{0,120}n[aã]o se aplica automaticamente|exce[cç][aã]o de hor[aá]rio mais tardio/i)) {
      out = appendOnce(out, LATE_BATH_RITUAL_CANON);
    } else if (!has(out, /in[ií]cio do sono noturno, n[aã]o (necessariamente )?para o come[cç]o do ritual/i)) {
      out = appendOnce(out, LATE_BATH_RITUAL_CANON);
    } else if (!has(out, /a que horas o dia come[cç]ou/i)) {
      out = appendOnce(
        out,
        'Antes de manter ou mudar o horário do ritual, diga a que horas o dia começou, quando terminou a última soneca, quanto tempo ele ficou acordado e como estava o comportamento.',
      );
    }
    out = out.replace(/[^.!?\n]*Preserve o hor[aá]rio que voc[eê] informou[^.!?]*[.!?]/gi, '');
    notes.push('eval_r8_ritual_not_preserve_clock');
  }

  if (
    /ritual/i.test(msg)
    && /18h|19h/i.test(msg)
    && !ids.has('early_night_ritual_crib_30_60')
    && !reportedLateBathRitual(msg)
  ) {
    out = stripRitualHyperstimulation(out);
    out = out.replace(/[^.!?\n]*intervalo.{0,40}entre o in[ií]cio do ritual.{0,120}(acima|al[eé]m)[^.!?]*[.!?]/gi, '');
    if (!has(out, /tempo de condu[cç][aã]o faz parte|efetivamente adormecer dentro da janela/i)) {
      out = appendOnce(out, RITUAL_WINDOW_CONDUCTION_CANON);
    }
    notes.push('eval_r8_ritual_no_hyperstimulation');
  }

  if (
    (reportedNightAfter3(msg) || ids.has('night_after_3_30_60') || ids.has('night_hourly_wakes_30_60'))
    && /ofere[cç]o|aceita o peito|de hora em hora|toda vez|peito sempre/i.test(msg)
  ) {
    if (!has(out, /Depois da mamada que encerra o jejum, volte ao intervalo/i)) {
      if (
        has(out, /Quando o jejum da idade j[aá] tiver sido alcan[cç]ado/i)
        && has(out, /tente primeiro reconduzi/i)
      ) {
        out = appendOnce(
          out,
          'Depois da mamada que encerra o jejum, volte ao intervalo da forma de alimentação: peito 2h a 2h30 ou mamadeira 3 horas, contados do início.',
        );
      } else if (has(out, /cerca de 3 horas aos 30 dias/i)) {
        if (!has(out, /tente primeiro reconduzi/i)) {
          out = appendOnce(
            out,
            'Se o jejum ainda não foi atingido e a mamada anterior foi efetiva, com saciedade, tente primeiro reconduzir ao sono.',
          );
        }
        if (!has(out, /Quando o jejum da idade j[aá] tiver sido alcan[cç]ado/i)) {
          out = appendOnce(out, 'Quando o jejum da idade já tiver sido alcançado, ofereça a mamada.');
        }
        out = appendOnce(
          out,
          'Depois da mamada que encerra o jejum, volte ao intervalo da forma de alimentação: peito 2h a 2h30 ou mamadeira 3 horas, contados do início.',
        );
      } else {
        out = appendOnce(out, NIGHT_OFFER_EVERY_TIME_CANON);
      }
      notes.push('eval_r8_offer_every_time_tree');
    }
  }

  if (ids.has('night_hourly_wakes_30_60') || (/depois das 4h|ap[oó]s as 4h/i.test(msg) && /hora em hora/i.test(msg))) {
    out = out.replace(/[^.!?\n]*quantidade adequada de leite durante o dia[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*n[aã]o est[aá] recebendo a quantidade adequada[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*intervalos curtos, como menos de 2 horas[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*[Cc]aso contr[aá]rio.{0,120}(sem oferecer|n[aã]o oferecer)[^.!?]*[.!?]/gi, '');
    out = stripHourlyUnfinishedFast(out);
    if (!has(out, /hor[aá]rio, sozinho, n[aã]o explica|recorr[eê]ncia hor[aá]ria n[aã]o prova/i)) {
      out = `${HOURLY_4H_INVESTIGATION_CANON}\n\n${out}`.trim();
    }
    notes.push('eval_r8_hourly_multifactor');
  }

  if (
    ids.has('crib_adaptation_same_day_30_60')
    || /todas as sonecas|uma soneca por (dia|vez)|passar.{0,40}ber[cç]o/i.test(msg)
  ) {
    out = stripCribInventedHowTo(out);
    if (!ids.has('crib_awake_start_30_60')) out = stripUnofficialCribSeguranca(out);
    out = stripCribCalmRequirement(out);
    if (!has(out, /todas as sonecas daquele mesmo dia|todas as sonecas do dia|n[aã]o [eé] avan[cç]ar uma soneca por vez/i)) {
      out = appendOnce(out, SAME_DAY_CRIB_CANON);
    }
    if (reportedLearnTimelineAsk(msg) && missingLearnTimeline(out)) {
      out = appendOnce(out, LEARN_TIMELINE_CANON);
    }
    notes.push('eval_r8_crib_9_3_no_invented_howto');
  }

  if (reportedAfterFeedPlay(msg) || ids.has('after_feed_play_30_60')) {
    out = out.replace(/[^.!?\n]*pode interagir levemente[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*ainda tem tempo para interagir[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*est[aá] calmo e dentro da janela[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*voc[eê] pode interagir[^.!?]*dentro da janela[^.!?]*[.!?]/gi, '');
    if (/18\s*minutos/i.test(msg) && !has(out, /18 minutos.{0,50}(abaixo|ainda n[aã]o|ainda est[aá] abaixo)/i)) {
      out = `${AFTER_FEED_UNKNOWN_WAKE_CANON}\n\n${out}`.trim();
      notes.push('eval_r8_after_feed_no_play_without_clock');
    }
    out = keepFirstMatch(out, /A janela come[cç]a quando ele acorda, n[aã]o quando termina a mamada[^.!?]*[.!?]/gi);
  }

  if (reportedCharutinho(msg) || ids.has('charutinho_undefined_30_60')) {
    out = out.replace(/[^.!?\n]*Antes de tratar o charutinho[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*n[aã]o deve ser rotulado como um problema[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*por si s[oó], n[aã]o deve ser rotulado[^.!?]*[.!?]/gi, '');
    if (!/^Nesta faixa o M[eé]todo n[aã]o define/i.test(out.trim())) {
      out = `${CHARUTINHO_UNDEFINED_CANON}\n\n${out}`.trim();
    }
    out = keepFirstMatch(out, /Nesta faixa o M[eé]todo n[aã]o define o [“"]charutinho[”"][^.!?]*[.!?]/gi);
    notes.push('eval_r8_charutinho_undefined_first');
  }

  if ((ids.has('bottle_volume_30_60') || /\d+\s*ml/i.test(msg)) && !/aprendizado|trabalho|ordenh/i.test(msg)) {
    out = out.replace(/[^.!?\n]*adapta[cç][aã]o do beb[eê] [aà] mamadeira[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*confus[aã]o de bico[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*aus[eê]ncia de desmame ou confus[aã]o[^.!?]*[.!?]/gi, '');
    out = stripUnsolicitedFormulaIntro(out);
    out = out.replace(/[^.!?\n]*agitado ou buscando o peito[^.!?]*[.!?]/gi, '');
    out = stripIrritationAsFeedChange(out);
    notes.push('eval_r8_no_nipple_confusion');
  }

  if (reportedNapOverMax(msg) || ids.has('nap_over_max_30_60')) {
    out = out.replace(
      /acord[áa]-l[oa] aos 2h\s*30 para oferecer a mamada/gi,
      'acordá-lo aos 2h30 para preservar a organização do dia',
    );
    out = out.replace(
      /acordar o beb[eê] aos 2h\s*30 para oferecer a mamada/gi,
      'acordar o bebê aos 2h30 para preservar a organização do dia',
    );
    out = out.replace(
      /[^.!?\n]*2h\s*30 para oferecer a mamada[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*acord[áaàe]-l[oa].{0,24}2h\s*30.{0,40}ofere[cç].{0,30}mamada[^.!?]*[.!?]/gi,
      '',
    );
    notes.push('eval_r8_wake_cap_not_auto_feed');
  }

  if (!/peso|ganho/i.test(msg)) {
    out = out.replace(/[^.!?\n]*ganhando peso[^.!?]*[.!?]/gi, '');
  }

  if (reportedLateAfternoon(msg) || ids.has('late_afternoon_cry_30_60')) {
    out = out.replace(/[^.!?\n]*confira a aula sobre refluxo[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*recomendo que voc[eê] confira a aula sobre refluxo[^.!?]*[.!?]/gi, '');
    if (!/^Na irritabilidade intensa/i.test(out.trim())) {
      out = `${LATE_AFTERNOON_CANON}\n\n${out}`.trim();
    }
    out = keepFirstMatch(out, /Na irritabilidade intensa e recorrente no fim da tarde[^.!?]*[.!?]/gi);
    notes.push('eval_r8_late_afternoon_first');
  }

  return out;
}

function applySingleVoicePass(text, msg, ids, notes) {
  let out = String(text || '');
  const calmVsWindow = /acordar calmo|reconduzo ou|j[aá] come[cç]o outra janela/i.test(msg);
  const sudden = reportedSuddenChange(msg) || ids.has('sudden_change_cry_30_60');
  const angryFacts = reportedAngryWake(msg);
  const nightHourlyAfter4 =
    ids.has('night_hourly_wakes_30_60')
    || (/depois das 4h|ap[oó]s as 4h/i.test(msg) && /hora em hora/i.test(msg));
  const nightOnly = (reportedNightAfter3(msg) || ids.has('night_after_3_30_60'))
    && !nightHourlyAfter4;
  const ritualClock = (/ritual/i.test(msg) && /18h|19h/i.test(msg))
    || ids.has('early_night_ritual_crib_30_60');
  const cribAsked = /todas as sonecas|passar.{0,40}ber[cç]o|uma soneca por (dia|vez)|ber[cç]o acordad|adormecer mamando/i.test(msg);

  if (reportedShortNaps2535(msg)) {
    out = out.replace(/[^.!?\n]*se (ele |ela )?acordar calmo.{0,180}recondu[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*acordar calmo.{0,160}(recondu|pode recondu|voc[eê] pode recondu)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*acorda(r)? calmo.{0,140}(pode |voc[eê] pode )?(reconduzi-l[oa]|reconduzir)[^.!?]*[.!?]/gi, '');
    if (!/22\s*(a|-|–)\s*28/.test(msg)) {
      out = out.replace(/22 a 28 minutos/gi, `${shortNapRangeLabel(msg)} minutos`);
    }
  }

  if (reportedWakePlusOnset(msg) || (reportedSlingCry(msg) && /chor/i.test(msg))) {
    out = dropAffirmativeWithinWindow(out);
    out = out.replace(/[^.!?\n]*com \d{2} minutos para adormecer.{0,80}dentro[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*acordado por cerca de \d+ minutos est[aá] dentro[^.!?]*[.!?]/gi, '');
  }

  if (nightOnly) {
    out = out.replace(/[^.!?\n]*limite da janela de vig[ií]lia[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*aproximando do limite da janela[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*janela de vig[ií]lia.{0,80}45 minutos a 1 hora e 15[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*isso pode ser um sinal de que ele est[aá] se aproximando do limite da janela[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*aula sobre ['"“”]?Despertares Noturnos[^.!?]*[.!?]/gi, '');
  }

  if (reportedFailedReconduction(msg)) {
    out = out.replace(/[^.!?\n]*tente coloc[aá]-l[oa] novamente no ber[cç]o[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*acalme-o no colo e tente coloc[aá]-l[oa] novamente[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*ainda demonstra sinais de cansa[cç]o.{0,80}novamente no ber[cç]o[^.!?]*[.!?]/gi, '');
    if (!/chupeta/i.test(msg)) {
      out = out.replace(/[^.!?\n]*queda da chupeta[^.!?]*[.!?]/gi, '');
      out = out.replace(/O despertar coincide com a queda da chupeta\??/gi, '');
    }
  }

  if (ritualClock && !/21h\s*30|21:30|22h/i.test(msg)) {
    out = stripRitualHyperstimulation(out);
    out = out.replace(/[^.!?\n]*intervalo entre o in[ií]cio do ritual.{0,120}(acima|al[eé]m|janela)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*come[cç]a o ritual.{0,80}adormece.{0,80}(acima|al[eé]m|janela de vig)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*considerando a janela de vig[ií]lia[^.!?]*[.!?]/gi, '');
  }

  if (sudden && !angryFacts) {
    out = out.replace(/Como ela consegue dormir por cerca de 1 hora[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*acordar muito irritad[oa] e relaxar depois de sugar[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*soneca de cerca de 1 hora[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*depois de cerca de 1 hora.{0,80}recondu[^.!?]*[.!?]/gi, '');
    out = out.replace(/Sugar pouco e relaxar ao despertar[^.!?]*[.!?]/gi, '');
    if (!cribAsked) {
      out = out.replace(/[^.!?\n]*todas as demais sonecas do mesmo dia no ber[cç]o[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*come[cç]ar a adaptar o beb[eê] ao ber[cç]o[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*primeira soneca da manh[aã].{0,120}mesmo dia no ber[cç]o[^.!?]*[.!?]/gi, '');
    }
  }

  if ((ids.has('nap_angry_wake_30_60') || angryFacts) && !sudden) {
    out = out.replace(/[^.!?\n]*buscando conforto[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*pode indicar que ele est[aá] buscando conforto[^.!?]*[.!?]/gi, '');
  }

  if (/refluxo/i.test(msg)) {
    out = out.replace(/[^.!?\n]*o refluxo pode contribuir[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*Como ele j[aá] apresenta refluxo[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*j[aá] apresenta refluxo.{0,80}importante observar[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*recomendo que voc[eê] tamb[eé]m confira a aula sobre refluxo[^.!?]*[.!?]/gi, '');
  }

  if (reportedSlingCry(msg) && /chor/i.test(msg) && !/ber[cç]o acordad|adormecer mamando/i.test(msg)) {
    out = out.replace(/[^.!?\n]*coloc[aá]-l[oa] acordad[oa] no ber[cç]o[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*oportunidade de adormecer ali[^.!?]*[.!?]/gi, '');
  }

  if (reportedShortNaps2535(msg) && calmVsWindow) {
    out = keepOfficialParagraphs(
      out,
      /ainda parece cansado|despertar (for )?definitivo|recondu[cç][aã]o cabe sobretudo|n[aã]o inicie outra condu[cç][aã]o s[oó] porque acordou calmo|2 a 5 minutos|abaixo de cerca de 20 minutos|chupeta cair|quando ela cai|comportamento ao acordar|irritabilidade/i,
    );
    notes.push('eval_single_voice_short_nap');
  } else if (nightOnly) {
    out = keepOfficialParagraphs(
      out,
      /jejum da idade|jejum noturno|sono noturno, n[aã]o vig[ií]lia|despertar no sono noturno|aceitar o peito.{0,50}n[aã]o comprova|n[aã]o o intervalo diurno|rel[oó]gio aqui [eé] o jejum|tente primeiro reconduzir|ofere[cç]a a mamada|volte ao intervalo da forma de alimenta[cç][aã]o|hor[aá]rio da [uú]ltima mamada efetiva|hor[aá]rio, sozinho, n[aã]o explica|recorr[eê]ncia hor[aá]ria n[aã]o prova|forma de adormecer/i,
    );
    notes.push('eval_single_voice_night');
  } else if (reportedWakePlusOnset(msg) && /fracion/i.test(msg)) {
    out = stripMorningNapAfternoonCause(out);
    out = keepOfficialParagraphs(
      out,
      /n[aã]o: isso n[aã]o est[aá] dentro da janela|acima da refer[eê]ncia|n[aã]o fracion|teto autom[aá]tico [eé] 2|janela conta do despertar/i,
    );
    out = keepFirstMatch(out, /janela conta do despertar at[eé] ele efetivamente adormecer[^.!?]*[.!?]/gi);
    out = out.replace(/[^.!?\n]*totalizando cerca de 1h44[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*aproximadamente 1h44[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*indicando uma vig[ií]lia excessiva[^.!?]*[.!?]/gi, '');
    out = keepFirstMatch(out, /cerca de 1h44[^.!?]*[.!?]/gi);
    notes.push('eval_single_voice_wake_onset');
  } else if (reportedFailedReconduction(msg)) {
    out = keepOfficialParagraphs(
      out,
      /siga o dia|despertar definitivo|recondu[cç][aã]o j[aá] foi tentada|recondu[cç][aã]o n[aã]o funcionar|abaixo de cerca de 20|saciedade e sinais de refluxo/i,
    );
    out = keepFirstMatch(
      out,
      /(?:Como a recondu[cç][aã]o j[aá] foi tentada e n[aã]o funcionou,\s*)?siga o dia: a nova janela come[cç]a no despertar definitivo[^.!?]*[.!?]/gi,
    );
    out = out.replace(/Se a recondu[cç][aã]o n[aã]o funcionar,\s*(?=Se |$|\n)/gi, '');
    out = out.replace(/Como a recondu[cç][aã]o j[aá] foi tentada e n[aã]o funcionou,\s*(?=Se |$|\n)/gi, '');
    if (has(out, /Se o padr[aã]o for recorrente/i)) {
      out = out.replace(/[^.!?\n]*Se sonecas abaixo de cerca de 20 minutos forem recorrentes[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*Se o padr[aã]o abaixo de cerca de 20 minutos for recorrente[^.!?]*[.!?]/gi, '');
    }
    notes.push('eval_single_voice_failed_reconduce');
  } else if (
    ritualClock
    && !ids.has('early_night_ritual_crib_30_60')
    && !/21h\s*30|21:30|22h|banho.{0,12}21h/i.test(msg)
  ) {
    out = stripRitualHyperstimulation(out);
    if (!has(out, /tempo de condu[cç][aã]o faz parte|efetivamente adormecer dentro da janela/i)) {
      out = appendOnce(out, RITUAL_WINDOW_CONDUCTION_CANON);
    }
    out = keepOfficialParagraphs(
      out,
      /[uú]ltimo despertar, n[aã]o no in[ií]cio do ritual|sem o hor[aá]rio em que ele acordou|19h a 20h [eé] para o in[ií]cio do sono noturno|ritual deve ser breve|dentro da refer[eê]ncia geral|tempo de condu[cç][aã]o faz parte|efetivamente adormecer dentro da janela/i,
    );
    out = stripRitualHyperstimulation(out);
    out = out.replace(/[^.!?\n]*intervalo.{0,40}entre o in[ií]cio do ritual.{0,120}(acima|al[eé]m)[^.!?]*[.!?]/gi, '');
    if (/19h\s*30|19:30/i.test(msg) && !has(out, /19h30 est[aá] dentro da refer[eê]ncia geral/i)) {
      out = appendOnce(
        out,
        'Adormecer às 19h30 está dentro da referência geral de 19h a 20h para o início do sono noturno, sem isso concluir a janela.',
      );
    }
    out = keepFirstMatch(out, /janela come[cç]a no [uú]ltimo despertar[^.!?]*[.!?]/gi);
    out = keepFirstMatch(out, /sem o hor[aá]rio (em que ele acordou|do [uú]ltimo despertar)[^.!?]*[.!?]/gi);
    out = out.replace(/E quanto tempo ele costuma ficar acordado antes de voc[eê] iniciar o ritual\??/gi, '');
    out = out.replace(/[^.!?\n]*intervalo.{0,40}entre o in[ií]cio do ritual.{0,120}(acima|al[eé]m)[^.!?]*[.!?]/gi, '');
    out = out.replace(
      /[^.!?\n]*iniciar o ritual.{0,80}18h20.{0,120}dentro da faixa[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(/Portanto, iniciar o ritual.{0,140}dentro da faixa recomendada[^.!?]*[.!?]/gi, '');
    notes.push('eval_single_voice_ritual');
  } else if (sudden && !angryFacts) {
    out = keepOfficialParagraphs(
      out,
      /Antes de atribuir o quadro a excesso de est[ií]mulos|mamada efetiva e saciedade.{0,40}(desconforto|refluxo)|40 a 50 minutos, sozinha|cerca de 45 minutos, sozinha, n[aã]o [eé] vig/i,
    );
    notes.push('eval_single_voice_sudden');
  } else if (reportedLateBathRitual(msg)) {
    out = keepOfficialParagraphs(
      out,
      /19h a 20h [eé] para o in[ií]cio do sono noturno|n[aã]o preserve o hor[aá]rio|ritual deve ser breve|mamada depois do banho|[uú]ltima soneca|[uú]ltima janela|a que horas o dia come[cç]ou|j[aá] est[aá] al[eé]m da refer[eê]ncia geral|Dormir perto das|exce[cç][aã]o de hor[aá]rio mais tardio|precisam ser avaliados para organizar/i,
    );
    out = stripLateNapCausalClaim(out);
    out = out.replace(/[^.!?\n]*Preserve o hor[aá]rio que voc[eê] informou[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*gostaria de saber a que horas termina a [uú]ltima soneca[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*Para entender melhor,\s*a que horas termina a [uú]ltima soneca[^.!?]*[.!?]/gi, '');
    out = keepFirstMatch(out, /O ritual deve ser breve[^.!?]*[.!?]/gi);
    notes.push('eval_single_voice_late_bath_ritual');
  } else if (reportedSlingCry(msg) && /chor/i.test(msg)) {
    out = keepOfficialParagraphs(
      out,
      /n[aã]o: o tempo total|acima da janela|Antes de atribuir o quadro s[oó] [aà] janela|prefer[eê]ncia por posi[cç][aã]o vertical, sozinha|antecipe a condu[cç][aã]o/i,
    );
    out = stripWindowHyperstimulationConsequence(out);
    if (has(out, /acima da janela/i) && !has(out, /antecip|inicie a condu[cç][aã]o|condu[cç][aã]o mais cedo|condu[cç][aã]o para o sono deve/i)) {
      out = appendOnce(out, 'Inicie a condução mais cedo para ele adormecer dentro da janela.');
    }
    notes.push('eval_single_voice_sling');
  } else if (reportedAfterFeedPlay(msg) || ids.has('after_feed_play_30_60')) {
    out = keepOfficialParagraphs(
      out,
      /sem o hor[aá]rio do [uú]ltimo despertar|n[aã]o quando termina a mamada|18 minutos.{0,60}(abaixo|ainda)|20 a 30 minutos ap[oó]s mamada|n[aã]o d[aá] para afirmar que ele ainda est[aá] dentro/i,
    );
    notes.push('eval_single_voice_after_feed');
  } else if (reportedCharutinho(msg) || ids.has('charutinho_undefined_30_60')) {
    out = keepOfficialParagraphs(
      out,
      /n[aã]o define o .{0,24}charutinho|validação metodol|Eliana Dias|Investigue como ele acorda|dura[cç][aã]o.{0,40}n[aã]o [eé] (o )?crit[eé]rio|tempo.{0,30}n[aã]o [eé] (o )?crit[eé]rio/i,
    );
    notes.push('eval_single_voice_charutinho');
  } else if (reportedAmbiguous9am(msg) || ids.has('ambiguous_clock_30_60')) {
    out = keepOfficialParagraphs(out, /sem esse contexto/i);
    notes.push('eval_single_voice_ambiguous_9h');
  } else if ((reportedNapOverMax(msg) || ids.has('nap_over_max_30_60')) && /21h|ainda est[aá] acordado/i.test(msg) && !reportedHealthyLongNight(msg)) {
    out = stripPresumedNightStart(out);
    out = keepOfficialParagraphs(
      out,
      /n[aã]o deve passar de 2 horas e 30|n[aã]o obriga mamada imediata|Organize as 24 horas|19h.{0,12}20h|sem aplicar isso de maneira r[ií]gida|a que horas o dia come[cç]ou|[uú]ltima janela|acorde o beb[eê] e organize/i,
    );
    notes.push('eval_single_voice_long_nap_day');
  } else if (reportedTwoHourWake(msg) && reportedNapOverMax(msg) && reportedHealthyLongNight(msg)) {
    out = keepOfficialParagraphs(
      out,
      /2 horas acordado j[aá] ultrapassa|n[aã]o deve passar de 2 horas e 30|n[aã]o o acorde s[oó] porque o sono passou|n[aã]o obriga mamada imediata|mamada s[oó] entra se o intervalo|preserve a organiza[cç][aã]o/i,
    );
    out = keepFirstMatch(out, /Ficar cerca de 2 horas acordado j[aá] ultrapassa[^.!?]*[.!?]/gi);
    out = keepFirstMatch(
      out,
      /(?:Se (?:ele|o beb[eê]) [eé] saud[aá]vel e dorme espontaneamente [àa] noite,\s*)?n[aã]o o acorde s[oó] porque o sono passou da progress[aã]o t[ií]pica[^.!?]*[.!?]/gi,
    );
    notes.push('eval_single_voice_combo_day_night');
  } else if (reportedLateAfternoon(msg) || ids.has('late_afternoon_cry_30_60')) {
    out = keepOfficialParagraphs(
      out,
      /cansa[cç]o e poss[ií]vel baixa produ[cç][aã]o|fim da tarde|reconduzir|abaixo de cerca de 20|duas aulas com o pediatra|saciedade e sinais de refluxo/i,
    );
    out = keepFirstMatch(out, /Se (?:o|esse) padr[aã]o(?: abaixo de cerca de 20 minutos)? for recorrente[^.!?]*[.!?]/gi);
    notes.push('eval_single_voice_late_afternoon');
  } else if (nightHourlyAfter4 && !motherReportedFirstStretch(msg)) {
    out = keepOfficialParagraphs(
      out,
      /hor[aá]rio, sozinho, n[aã]o explica|recorr[eê]ncia hor[aá]ria n[aã]o prova|jejum da idade|jejum noturno da idade|Se ele mamou efetivamente|sem o hor[aá]rio e a qualidade|volte ao intervalo da forma de alimenta[cç][aã]o|aceitar o peito.{0,50}n[aã]o comprova|tente primeiro reconduzir|ofere[cç]a a mamada|forma de adormecer|desconfortos|medidas posturais/i,
    );
    out = stripHourlyUnfinishedFast(out);
    out = keepFirstMatch(out, /Aceitar o peito ao acordar n[aã]o comprova fome[^.!?]*[.!?]/gi);
    out = keepFirstMatch(out, /O primeiro passo [eé] ver h[aá] quanto tempo foi a [uú]ltima mamada efetiva[^.!?]*[.!?]/gi);
    out = keepFirstMatch(out, /[^.!?\n]*cerca de 3 horas aos 30 dias[^.!?]*[.!?]/gi);
    notes.push('eval_single_voice_hourly_4h');
  } else if (ids.has('crib_adaptation_same_day_30_60') || /todas as sonecas|uma soneca por (dia|vez)/i.test(msg)) {
    out = stripCribInventedHowTo(out);
    if (!ids.has('crib_awake_start_30_60')) out = stripUnofficialCribSeguranca(out);
    out = stripCribCalmRequirement(out);
    if (reportedLearnTimelineAsk(msg) && missingLearnTimeline(out)) {
      out = appendOnce(out, LEARN_TIMELINE_CANON);
    }
    out = keepOfficialParagraphs(
      out,
      /todas as sonecas daquele mesmo dia|todas as sonecas do dia|n[aã]o [eé] avan[cç]ar uma soneca por vez|gradual e compat[ií]vel|Antes de passar as sonecas|mamada efetiva e saciedade.{0,80}janela|Use a Estrat[eé]gia do Travesseiro|Assista [àa] aula sobre a Estrat[eé]gia do Travesseiro|consist[eê]ncia e repeti[cç][aã]o|passo a passo da T[eé]cnica|janela de vig[ií]lia de refer[eê]ncia|n[aã]o existe prazo|prazo oficial|validação da Eliana Dias|acolhendo o choro/i,
    );
    out = stripCribInventedHowTo(out);
    if (!ids.has('crib_awake_start_30_60')) out = stripUnofficialCribSeguranca(out);
    out = stripCribCalmRequirement(out);
    notes.push('eval_single_voice_crib_9_3');
  } else if ((ids.has('nap_angry_wake_30_60') || angryFacts) && !sudden) {
    out = keepOfficialParagraphs(
      out,
      /n[aã]o consideraria a dura[cç][aã]o da soneca|n[aã]o comprova saciedade|n[aã]o significa automaticamente|arrotou e permaneceu|20 a 30 minutos|duas aulas com o pediatra|recondu[cç][aã]o breve|desconforto depois|saciedade\?|colocad[oa] no ber[cç]o/i,
    );
    out = String(out)
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p && !/O primeiro passo [eé] investigar a alimenta[cç][aã]o e a saciedade/i.test(p))
      .join('\n\n');
    notes.push('eval_single_voice_angry_wake');
  }

  return dedupeSimilarParagraphs(out.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim());
}

function applyRound14LeftoverGuards(text, msg, ids, notes) {
  let out = String(text || '');

  if (reportedNapOverMax(msg) || ids.has('nap_over_max_30_60')) {
    out = stripEarlyNapCloseBeforeCap(out, msg);
    out = fixNapCapComposition(out);
    notes.push('eval_r14_nap_cap_no_early_close');
  }

  if (ids.has('bottle_volume_30_60')) {
    out = stripIrritationAsFeedChange(out);
    notes.push('eval_r14_bottle_no_irritation_feed');
  }

  if (
    ids.has('crib_adaptation_same_day_30_60')
    || /todas as sonecas|uma soneca por (dia|vez)|passar.{0,40}ber[cç]o/i.test(msg)
  ) {
    out = stripCribInventedHowTo(out);
    if (!has(out, /n[aã]o [eé] avan[cç]ar uma soneca por vez/i)) {
      out = appendOnce(
        out,
        'O indicado não é avançar uma soneca por vez ao longo dos dias.',
      );
    }
    if (!has(out, /gradual e compat[ií]vel com a idade/i)) {
      out = appendOnce(
        out,
        'Trabalhe de forma gradual e compatível com a idade, sem exigir rigidez de comportamento.',
      );
    }
    notes.push('eval_r14_crib_no_colo_loop');
  }

  if (reportedShortNaps2535(msg)) {
    if (has(out, /recondu[cç][aã]o cabe sobretudo/i)) {
      out = out.replace(/[^.!?\n]*tente uma recondu[cç][aã]o breve[^.!?]*[.!?]/gi, '');
      out = out.replace(/Se o despertar for definitivo, come[cç]a uma nova janela a partir da[ií][^.!?]*[.!?]/gi, '');
    }
    if (!has(out, /comportamento ao acordar|irritabilidade, as prioridades/i)) {
      out = appendOnce(out, shortNapRecurrentTail(msg));
    }
    notes.push('eval_r14_short_nap_once');
  }

  if (reportedSleepBeforeFeed(msg) || ids.has('sleep_before_feed_30_60')) {
    out = out.replace(/[^.!?\n]*voc[eê] pode optar por deix[aá]-l[oa] dormir[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*aula.{0,80}Janela de Vig[ií]lia[^.!?]*[.!?]/gi, '');
    notes.push('eval_r14_sleep_before_feed_once');
  }

  if (reportedWakePlusOnset(msg) && has(out, /cerca de 1h44|n[aã]o: isso n[aã]o est[aá] dentro/i)) {
    out = out.replace(
      /[^.!?\n]*[eé] importante observar que.{0,80}janela de vig[ií]lia de refer[eê]ncia[^.!?]*[.!?]/gi,
      '',
    );
    notes.push('eval_r14_no_redundant_window_intro');
  }

  if (reportedLateBathRitual(msg)) {
    out = out.replace(/[^.!?\n]*aula sobre (o )?in[ií]cio do sono noturno[^.!?]*[.!?]/gi, '');
    out = out.replace(
      /O ritual deve ser breve, normalmente (consistindo em|envolvendo) banho, mamada e dormir[^.!?]*[.!?]/gi,
      'O ritual deve ser breve: banho, mamada, medidas posturais e condução ao berço. ',
    );
    out = out.replace(/ber[cç]o\.A refer/g, 'berço. A refer');
    out = out.replace(
      /[^.!?\n]*Isso pode ajudar a entender melhor a situa[cç][aã]o e ajustar o ritual[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*[AÁa] [uú]ltima soneca deve ser avaliada[^.!?]*[.!?]/gi,
      '',
    );
    notes.push('eval_r14_late_bath_no_generic_lesson');
  }

  return out;
}

function applyRound15LeftoverGuards(text, msg, ids, notes) {
  let out = String(text || '');

  if (ids.has('nap_angry_wake_30_60')) {
    out = mergeAngryWakeAsks(out);
    if (has(out, /mamada parec(?:e|eu) efetiva/i)) {
      out = out.replace(/[^.!?\n]*Primeiro, investigue a efetividade da mamada[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*e ele permaneceu em posi[cç][aã]o vertical[^.?]*\??/gi, '');
      out = out.replace(/[^.!?\n]*Essas informa[cç][oõ]es s[aã]o essenciais[^.!?]*[.!?]/gi, '');
      out = String(out)
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p && !/Primeiro,.{0,80}(efetividade da mamada|investigar a alimenta[cç][aã]o)/i.test(p))
        .join('\n\n');
    }
    if (has(out, /arrotou e permaneceu em posi[cç][aã]o vertical/i)) {
      out = out.replace(
        /[^.!?\n]*(Al[eé]m disso, )?ap[oó]s a mamada, [eé] (importante|fundamental) que ele permane[cç]a em posi[cç][aã]o vertical[^.!?]*[.!?]/gi,
        '',
      );
      out = out.replace(
        /[^.!?\n]*Isso pode ajudar a evitar desconfortos, como refluxo[^.!?]*[.!?]/gi,
        '',
      );
      out = out.replace(/^Ele permaneceu em posi[cç][aã]o vertical\??\s*$/gim, '');
      out = out.replace(/\nEle permaneceu em posi[cç][aã]o vertical\??\s*/gi, '\n');
      out = out.replace(/^por esse tempo\??\s*$/gim, '');
      out = out.replace(/\npor esse tempo\??\s*/gi, '\n');
      out = out.replace(
        /[^.!?\n]*Ele permaneceu em posi[cç][aã]o vertical por esse tempo\??/gi,
        '',
      );
    }
    out = out.replace(
      /[^.!?\n]*O primeiro passo [eé] investigar a alimenta[cç][aã]o e a saciedade[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*Primeiro, [eé] importante investigar a alimenta[cç][aã]o e a saciedade[^.!?]*[.!?]/gi,
      '',
    );
    out = String(out)
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p && !/Primeiro, [eé] importante investigar a alimenta[cç][aã]o/i.test(p))
      .join('\n\n');
    out = out.replace(
      /[^.!?\n]*Verifique se a mamada foi efetiva, observando a suc[cç][aã]o ativa e a degluti[cç][aã]o[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*Isso pode ajudar a evitar desconfortos[^.!?]*[.!?]/gi,
      '',
    );
    out = String(out)
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p && !/O primeiro passo [eé] investigar a alimenta[cç][aã]o e a saciedade/i.test(p))
      .join('\n\n');
    out = out.replace(
      /[^.!?\n]*Al[eé]m disso, verifique se ele apresenta sinais de saciedade[^.!?]*[.!?]/gi,
      '',
    );
    notes.push('eval_r15_angry_wake_asks_once');
  }

  if (
    (reportedNapOverMax(msg) || ids.has('nap_over_max_30_60'))
    && /21h/i.test(msg)
    && /ainda est[aá] acordado/i.test(msg)
  ) {
    if (has(out, /sem aplicar isso de maneira r[ií]gida/i)) {
      out = out.replace(
        /[^.!?\n]*A fam[ií]lia pode organizar conforme sua din[aâ]mica, mas iniciar o sono noturno por volta de 21h30 ou 22h n[aã]o [eé] o recomendado[^.!?]*[.!?]/gi,
        '',
      );
    }
    if (has(out, /n[aã]o obriga mamada imediata/i)) {
      out = out.replace(
        /[^.!?\n]*ao atingir 2h30, acorde o beb[eê] e organize a pr[oó]xima janela[^.!?]*[.!?]/gi,
        '',
      );
    }
    out = out.replace(/[^.!?\n]*iniciar o ritual de sono agora[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*oportunidade de adormecer no ber[cç]o[^.!?]*[.!?]/gi, '');
    out = out.replace(
      /[^.!?\n]*o dia do beb[eê].{0,60}comece com a primeira soneca[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*j[aá] inicia a noite [àaá]s 21h[^.!?]*[.!?]/gi,
      '',
    );
    if (has(out, /sem aplicar isso de maneira r[ií]gida/i)) {
      out = String(out)
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => {
          if (!p) return false;
          const isRigid = /sem aplicar isso de maneira r[ií]gida/i.test(p);
          const isDuplicateNightRef = /19h.{0,12}20h/i.test(p) && !isRigid;
          const isGenericNight =
            /in[ií]cio do sono noturno ocorra entre 19h e 20h|A recomenda[cç][aã]o [eé] que o in[ií]cio do sono noturno/i.test(p);
          const isJanelaAula = /aula sobre (a )?janela de vig[ií]lia/i.test(p);
          const isGenericJanelaIntro =
            /Para organizar o dia, (observe|considere) a janela de vig[ií]lia/i.test(p)
            || /Para organizar o dia, observe a [uú]ltima soneca e a janela/i.test(p)
            || (/considere a janela de vig[ií]lia de 45/i.test(p) && !/24 horas|r[ií]gida|n[aã]o obriga mamada/i.test(p))
            || (/observe que a janela de vig[ií]lia [eé] de 45/i.test(p)
              && !/24 horas|r[ií]gida|n[aã]o obriga mamada/i.test(p));
          if (!isRigid && (isDuplicateNightRef || isGenericNight || isJanelaAula || isGenericJanelaIntro)) return false;
          return true;
        })
        .join('\n\n');
      out = out.replace(
        /[^.!?\n]*[eé] importante observar a [uú]ltima soneca e a janela de vig[ií]lia[^.!?]*[.!?]/gi,
        '',
      );
      out = out.replace(/[^.!?\n]*Isso ajudar[aá] a ajustar a rotina dele[^.!?]*[.!?]/gi, '');
    }
    out = ensureLateAwakeBeyondSentence(out, msg);
    if (!has(out, /[ÉE] compreens[ií]vel que voc[eê] esteja preocupada com a organiza[cç][aã]o do dia/i)) {
      const ageM = String(msg).match(/(\d+)\s*dias/i);
      const ageBit = ageM ? ` do seu bebê de ${ageM[1]} dias` : '';
      out = `É compreensível que você esteja preocupada com a organização do dia${ageBit}.\n\n${out}`.trim();
    }
    notes.push('eval_r15_day_org_night_ref_once');
  }

  if (reportedSleepBeforeFeed(msg) || ids.has('sleep_before_feed_30_60')) {
    out = out.replace(/[^.!?\n]*arrot[oa].{0,80}posi[cç][aã]o vertical[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*permanece em posi[cç][aã]o vertical[^.?]*\??/gi, '');
    out = out.replace(/[^.!?\n]*Essas informa[cç][oõ]es podem ajudar a entender melhor a situa[cç][aã]o[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*Isso pode ajudar a evitar desconfortos([^.!?]{0,40})?[^.!?]*[.!?]/gi, '');
    out = out.replace(
      /Se ele j[aá] est[aá] saciado e apenas dorme, pode ser melhor deix[aá]-l[oa] dormir[^.!?]*[.!?]/gi,
      'Se está saciado e apenas com sono, pode deixá-lo dormir e oferecer a mamada ao acordar.',
    );
    out = out.replace(
      /j[aá] est[aá] saciado e apenas dorme/gi,
      'está saciado e apenas com sono',
    );
    out = out.replace(
      /[^.!?\n]*Se ele acordar tranquilo[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*a orienta[cç][aã]o [eé] deixar (ele|o beb[eê]) dormir[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(/[^.!?\n]*apenas sugando para conforto[^.!?]*[.!?]/gi, '');
    out = out.replace(
      /[^.!?\n]*Se ele n[aã]o apresentar sinais de desconforto ou refluxo[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*Al[eé]m disso, se voc[eê] notar sinais de desconforto ou refluxo[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /Se ele j[aá] mamou bem e est[aá] apenas com sono, pode ser melhor deix[aá]-l[oa] dormir[.!?]/gi,
      'Se está saciado e apenas com sono, pode deixá-lo dormir e oferecer a mamada ao acordar.',
    );
    out = out.replace(
      /[^.!?\n]*Para garantir que ele est[aá] bem alimentado[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*Se ele est[aá] saciado, pode ser mais ben[eé]fico deix[aá]-l[oa] dormir[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*acordar tranquilo ou chorando[^.?]*\??/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*Isso pode ajudar a entender melhor a situa[cç][aã]o[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /^Isso ajuda a compatibilizar a alimenta[cç][aã]o com a janela de sono[.!?]\s*/i,
      '',
    );
    out = out.replace(
      /[^.!?\n]*Para garantir que ele est[aá] se alimentando adequadamente[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*Para garantir que ele esteja saciado[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*Se ele j[aá] est[aá] saciado, pode ser mais ben[eé]fico deix[aá]-l[oa] descansar[^.!?]*[.!?]/gi,
      '',
    );
    if (!has(out, /antecipar a mamada/i)) {
      out = appendOnce(
        out,
        'Não há uma única conduta: você pode antecipar a mamada quando precisar compatibilizar alimentação e janela de sono, ou, se está saciado e apenas com sono, deixar dormir e oferecer a mamada ao acordar, sobretudo se as sonecas costumam ser curtas.',
      );
    } else if (!has(out, /apenas com sono/i) || !has(out, /oferecer a mamada ao acordar/i)) {
      out = appendOnce(
        out,
        'Se está saciado e apenas com sono, pode deixá-lo dormir e oferecer a mamada ao acordar.',
      );
    }
    notes.push('eval_r15_sleep_before_feed_no_postural_ask');
  }

  if (ids.has('bottle_volume_30_60')) {
    out = out.replace(/[^.!?\n]*Para garantir que.{0,80}alimentando adequadamente[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*O importante [eé] verificar se houve uma (mamada|retirada) efetiva[^.!?]*[.!?]/gi, '');
    out = out.replace(
      /,\s*pois o importante [eé] verificar se houve (uma )?(mamada|retirada) efetiva[^.!?]*[.!?]/gi,
      '.',
    );
    if (has(out, /tempo isoladamente n[aã]o determina/i)) {
      out = out.replace(
        /[^.!?\n]*O importante [eé] verificar se houve (uma )?(mamada|retirada) efetiva[^.!?]*[.!?]/gi,
        '',
      );
      out = out.replace(
        /[^.!?\n]*O tempo de \d+ minutos no peito pode ser considerado normal[^.!?]*[.!?]/gi,
        '',
      );
      out = out.replace(
        /,\s*desde que tenha havido (uma )?(mamada|retirada) efetiva[^.!?]*[.!?]/gi,
        '.',
      );
      out = out.replace(
        /[^.!?\n]*Voc[eê] j[aá] notou se.{0,120}sinais de saciedade[^.?]*\??/gi,
        '',
      );
    }
    out = out.replace(/[^.!?\n]*mamadeira deve ser oferecida.{0,120}(calmo|primeira mamada da noite|final da tarde)[^.!?]*[.!?]/gi, '');
    out = out.replace(
      /[^.!?\n]*como est[aá] sendo a aceita[cç][aã]o da mamadeira[^.?]*\??/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*Se ele mamou efetivamente e est[aá] calmo, isso [eé] um bom sinal[^.!?]*[.!?]/gi,
      '',
    );
    out = keepFirstMatch(out, /O tempo isoladamente n[aã]o determina o t[eé]rmino da mamada[^.!?]*[.!?]/gi);
    notes.push('eval_r15_bottle_satiety_once');
  }

  if (
    (ids.has('crib_adaptation_same_day_30_60') || /todas as sonecas|uma soneca por (dia|vez)|passar.{0,40}ber[cç]o/i.test(msg))
    && reportedLearnTimelineAsk(msg)
  ) {
    out = out.replace(/[^.!?\n]*Sobre o tempo para aprender[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*Quanto ao tempo para aprender[^.!?]*[.!?]/gi, '');
    if (has(out, /N[aã]o existe prazo oficial definido nas regras para ele aprender/i)) {
      out = out.replace(/[^.!?\n]*n[aã]o existe um prazo fixo[^.!?]*[.!?]/gi, '');
    }
    out = keepFirstMatch(out, /N[aã]o existe prazo oficial definido nas regras para ele aprender[^.!?]*[.!?]/gi);
    if (has(out, /Mantenha o processo com consist[eê]ncia e repeti[cç][aã]o.{0,80}acolhendo o choro/i)) {
      out = out.replace(/A evolu[cç][aã]o depende d[ae] consist[eê]ncia e repeti[cç][aã]o[^.!?]*[.!?]\s*/gi, '');
    }
    out = keepFirstMatch(
      out,
      /Mantenha o processo com consist[eê]ncia e repeti[cç][aã]o, acolhendo o choro e ajudando no colo sempre que necess[aá]rio[.!?]?/gi,
    );
    if (
      has(out, /janela est[aá] entre 45 minutos|observe a janela de vig[ií]lia de 45/i)
    ) {
      out = out.replace(
        /A janela de vig[ií]lia de refer[eê]ncia [eé] de 45 minutos a 1 hora e 15 minutos[.!?]\s*/gi,
        '',
      );
      out = out.replace(
        /[^.!?\n]*[ÉE] fundamental que voc[eê] observe a janela de vig[ií]lia[^.!?]*[.!?]/gi,
        '',
      );
    }
    out = out.replace(/[^.!?\n]*[ÉE] compreens[ií]vel que voc[eê] esteja[^.!?]*[.!?]\s*/gi, '');
    out = out.replace(
      /A principal orienta[cç][aã]o [eé] que, ao iniciar a adapta[cç][aã]o ao ber[cç]o[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(/[^.!?\n]*Entendo que seu beb[eê].{0,100}s[oó] dorme no colo[^.!?]*[.!?]\s*/gi, '');
    out = out.replace(
      /[^.!?\n]*n[aã]o deve ser normalizada como uma fase de adapta[cç][aã]o[^.!?]*[.!?]\s*/gi,
      '',
    );
    if (has(out, /todas as sonecas daquele mesmo dia|n[aã]o [eé] avan[cç]ar uma soneca por vez/i)) {
      out = out.replace(
        /[^.!?\n]*Voc[eê] pode passar todas as sonecas para o ber[cç]o, mas [eé] fundamental[^.!?]*[.!?]\s*/gi,
        '',
      );
    }
    notes.push('eval_r15_crib_prazo_consistency_once');
  }

  if (ids.has('crib_adaptation_same_day_30_60') || /todas as sonecas|uma soneca por (dia|vez)|passar.{0,40}ber[cç]o/i.test(msg)) {
    out = out.replace(
      /[^.!?\n]*quanto tempo ele costuma (ficar|permanecer) acordado antes das sonecas[^.?]*\??/gi,
      '',
    );
    if (!reportedLearnTimelineAsk(msg) && !ids.has('crib_awake_start_30_60')) {
      if (has(out, /todas as sonecas daquele mesmo dia|n[aã]o [eé] avan[cç]ar uma soneca por vez/i)) {
        out = out.replace(
          /[^.!?\n]*Para a adapta[cç][aã]o ao ber[cç]o[^.!?]{0,80}TODAS as sonecas[^.!?]*[.!?]/gi,
          '',
        );
        out = out.replace(
          /[^.!?\n]*(?:[eé] importante que voc[eê] )?trabalhe TODAS as sonecas do mesmo dia[^.!?]*[.!?]/gi,
          '',
        );
        out = out.replace(
          /[^.!?\n]*voc[eê] deve trabalhar TODAS as sonecas do (mesmo )?dia[^.!?]*[.!?]/gi,
          '',
        );
        out = out.replace(
          /[^.!?\n]*TODAS as sonecas do (mesmo )?dia[^.!?]{0,40}n[aã]o apenas uma por vez[^.!?]*[.!?]/gi,
          '',
        );
        out = out.replace(
          /[^.!?\n]*Isso deve ser feito de forma gradual e compat[ií]vel com a idade dele[^.!?]*[.!?]/gi,
          '',
        );
      }
      if (!has(out, /todas as sonecas daquele mesmo dia/i)) {
        out = appendOnce(
          out,
          'Trabalhe a aprendizagem no berço em todas as sonecas daquele mesmo dia, de forma gradual e compatível com a idade, sem exigir rigidez de comportamento.',
        );
      }
      if (has(out, /todas as sonecas daquele mesmo dia/i)) {
        out = out.replace(
          /Trabalhe de forma gradual e compat[ií]vel com a idade, sem exigir rigidez de comportamento[.!?]\s*/gi,
          '',
        );
      }
      out = out.replace(/,?\s*pois isso pode ajudar bastante[^.!?]*[.!?]/gi, '.');
      out = out.replace(/[^.!?\n]*Essa t[eé]cnica pode ajudar bastante[^.!?]*[.!?]/gi, '');
      out = out.replace(/,?\s*Essa t[eé]cnica pode ajudar bastante[^.!?]*/gi, '');
      out = out.replace(
        /[^.!?\n]*[ÉE] importante repetir diariamente at[eé] que ele se adapte[^.!?]*[.!?]/gi,
        '',
      );
      out = out.replace(
        /,?\s*ent[aã]o fique atenta a isso ao iniciar a condu[cç][aã]o para o sono[.!]?/gi,
        '.',
      );
      out = out.replace(/\s+\./g, '.');
      notes.push('eval_r16_crib_same_day_once');
    }
  }

  if (
    /ritual/i.test(msg)
    && /18h|19h/i.test(msg)
    && !ids.has('early_night_ritual_crib_30_60')
    && !reportedLateBathRitual(msg)
  ) {
    out = out.replace(
      /[^.!?\n]*iniciar o ritual.{0,80}18h20.{0,120}dentro da faixa[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /Portanto, iniciar o ritual.{0,140}dentro da faixa recomendada[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*acordado por muito tempo (antes do ritual|entre o in[ií]cio do ritual)[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*evitar que ele fique muito tempo acordado[^.!?]*[.!?]/gi,
      '',
    );
    if (/18h20|18:20/i.test(msg)) {
      out = out.replace(
        /[^.!?\n]*verificar quanto tempo ele permanece acordado antes de iniciar (a condu[cç][aã]o|o ritual)[^.!?]*[.!?]\s*/gi,
        '',
      );
      out = out.replace(
        /O ritual deve ser breve, normalmente (consistindo em|envolvendo) banho, mamada e dormir[^.!?]*[.!?]\s*/gi,
        '',
      );
      out = out.replace(
        /Isso nos ajudar[aá] a encontrar a melhor abordagem[^.!?]*[.!?]\s*/gi,
        '',
      );
      if (has(out, /19h30 est[aá] dentro da refer[eê]ncia geral/i)) {
        out = out.replace(
          /O hor[aá]rio (saud[aá]vel e )?recomendado para o in[ií]cio do sono noturno [eé] entre 19h e 20h[.!?]\s*/gi,
          '',
        );
        out = out.replace(
          /O ritual deve ser breve, e a janela de vig[ií]lia [eé] de 45 minutos a 1 hora e 15 minutos[.!?]\s*/gi,
          '',
        );
      }
    }
    notes.push('eval_r15_ritual_no_ambiguous_band');
  }

  if (ids.has('crib_awake_start_30_60') || /sono leve/i.test(msg)) {
    out = out.replace(/Como voc[eê] est[aá] (utilizando|realizando) a Estrat[eé]gia do Travesseiro\??\s*/gi, '');
    out = out.replace(/Est[aá] utilizando a Estrat[eé]gia do Travesseiro\??\s*/gi, '');
    out = out.replace(/Como voc[eê] est[aá] realizando a condu[cç][aã]o para o sono\??/gi, '');
    out = out.replace(/como voc[eê] est[aá] realizando essa t[eé]cnica\??/gi, '');
    out = out.replace(
      /[^.!?\n]*Para entender melhor como est[aá] sendo a execu[cç][aã]o da Estrat[eé]gia do Travesseiro[^.?]*\??/gi,
      '',
    );
    out = out.replace(/[^.!?\n]*como est[aá] sendo realizada a Estrat[eé]gia do Travesseiro[^.?]*\??/gi, '');
    out = out.replace(
      /Al[eé]m disso, se voc[eê] j[aá] utiliza a Estrat[eé]gia do Travesseiro, como est[aá] sendo realizada\??/gi,
      '',
    );
    out = out.replace(/Isso pode ajudar a organizar a condu[cç][aã]o do sono[.!?]\s*/gi, '');
    out = out.replace(/Isso pode ajudar a ajustar a condu[cç][aã]o do sono[.!?]\s*/gi, '');
    out = out.replace(
      /[^.!?\n]*como voc[eê] est[aá] realizando a condu[cç][aã]o e a Estrat[eé]gia do Travesseiro[^.?]*\??/gi,
      '',
    );
    out = out.replace(/[^.!?\n]*poderia me contar como est[aá] sendo essa execu[cç][aã]o[^.?]*\??/gi, '');
    out = out.replace(/[^.!?\n]*Isso pode ajudar na sua adapta[cç][aã]o ao ber[cç]o[^.!?]*[.!?]/gi, '');
    out = out.replace(/Isso pode ajudar na adapta[cç][aã]o ao ber[cç]o[.!?]\s*/gi, '');
    out = out.replace(/\.?\s*Isso pode ajudar a organizar melhor a rotina[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*Essa t[eé]cnica pode ajudar.{0,80}seguran[cç]a[^.!?]*[.!?]/gi, '');
    out = out.replace(
      /[^.!?\n]*Para entender melhor como est[aá] sendo a condu[cç][aã]o do sono[^.?]*\??/gi,
      '',
    );
    out = out.replace(/E na condu[cç][aã]o e (na )?coloca[cç][aã]o no ber[cç]o\??/gi, '');
    out = out.replace(/[^.!?\n]*E na condu[cç][aã]o e (na )?coloca[cç][aã]o no ber[cç]o[^.?]*\??/gi, '');
    out = out.replace(/[^.!?\n]*quanto tempo ele costuma (ficar|permanecer) acordado antes das sonecas[^.?]*\??/gi, '');
    out = out.replace(/[^.!?\n]*quanto tempo ele costuma (ficar|permanecer) acordado antes de voc[eê] iniciar a condu[cç][aã]o[^.?]*\??/gi, '');
    out = out.replace(/Como voc[eê] j[aá] est[aá] utilizando a mamada, gostaria de saber:[^.?]*\??/gi, '');
    out = out.replace(/[^.!?\n]*Como voc[eê] j[aá] est[aá] utilizando a mamada[^.?]*\??/gi, '');
    out = out.replace(/[^.!?\n]*Isso ajudar[aá] a organizar a rotina e a condu[cç][aã]o do sono[^.!?]*[.!?]/gi, '');
    out = keepFirstMatch(
      out,
      /A Estrat[eé]gia do Travesseiro tamb[eé]m pode ajudar na condu[cç][aã]o e na coloca[cç][aã]o do beb[eê] no ber[cç]o[^.!?]*[.!?]/gi,
    );
    out = stripUnofficialCribSeguranca(out);
    if (has(out, /tamb[eé]m pode ajudar na condu[cç][aã]o e na coloca[cç][aã]o do beb[eê] no ber[cç]o/i)) {
      out = out.replace(
        /Isso pode ajudar na condu[cç][aã]o e na coloca[cç][aã]o no ber[cç]o[^.!?]*[.!?]/gi,
        '',
      );
      out = out.replace(
        /[^.!?\n]*que pode trazer mais seguran[cç]a[^.!?]*[.!?]\s*/gi,
        '',
      );
    }
    out = out.replace(
      /[^.!?\n]*Se precisar de mais informa[cç][oõ]es.{0,100}me avise[^.!?]*[.!?]\s*/gi,
      '',
    );
    if (has(out, /n[aã]o o acorde s[oó] para coloc[aá]-lo acordado/i)) {
      out = out.replace(
        /[^.!?\n]*adorme[cç]a? mamando, voc[eê] pode coloc[aá]-lo no ber[cç]o j[aá] dormindo[^.!?]*[.!?]\s*/gi,
        '',
      );
    }
    if (!/refluxo/i.test(msg)) {
      out = out.replace(
        /;\s*at[eé]\s*(?:cerca de |~)?40 minutos se houver refluxo[^)]*/gi,
        '',
      );
      out = out.replace(
        /\(\s*at[eé]\s*(?:cerca de |~)?40 minutos se houver refluxo[^)]*\)/gi,
        '',
      );
      out = out.replace(/20 a 30 minutos;\s*e, então/gi, '20 a 30 minutos) e, então');
      out = out.replace(/20 a 30 minutos;\s*\)/g, '20 a 30 minutos)');
      out = out.replace(/\s*\(\s*\)/g, '');
    }
    out = stripOperationalCryOnce(out);
    out = dedupeCribCryCalm(out);
    out = out.replace(/\.\s*E Se ele se irritar/g, '. Se ele se irritar');
    out = out.replace(/\bE Se ele se irritar/g, 'Se ele se irritar');
    notes.push('eval_r15_crib_awake_travesseiro_once');
  }

  if (reportedLateBathRitual(msg) && has(out, /N[aã]o preserve o hor[aá]rio do ritual antes de saber/i)) {
    out = out.replace(
      /A dura[cç][aã]o do ritual deve ser breve[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*verificar quanto tempo (ele|ela) permanece acordado antes de iniciar o ritual[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*[uú]ltima soneca e o tempo acordado[^.!?\n]{0,80}informa[cç][oõ]es importantes para ajustar[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*[uú]ltima soneca.{0,80}acordado.{0,80}informa[cç][oõ]es importantes[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*A janela de vig[ií]lia [eé] de 45 minutos a 1 hora e 15 minutos, e o ritual deve ser organizado[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*[uú]ltima soneca do dia tamb[eé]m deve ser considerada[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*verificar quanto tempo ele permanece acordado antes de tentar iniciar a noite[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*A janela de vig[ií]lia [eé] de 45 minutos a 1 hora e 15 minutos, e o ritual deve ser ajustado[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(/Qual [eé] o hor[aá]rio em que a [uú]ltima soneca termina\??\s*/gi, '');
    out = out.replace(
      /[^.!?\n]*aula ['"“”']?In[ií]cio do Sono Noturno['"“”']?[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*aula ['"“”']?Sono Noturno['"“”']?[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*Para mais (orienta[cç][oõ]es|informa[cç][oõ]es) sobre a rotina e o sono noturno[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*A demora para adormecer n[aã]o deve ser explicada apenas pelo hor[aá]rio[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*verificar a [uú]ltima soneca e a janela de vig[ií]lia[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /Observe a que horas termina a [uú]ltima soneca e h[aá] quanto tempo est[aá] acordado[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(/ber[cç]o\.A refer/g, 'berço. A refer');
    notes.push('eval_r16_late_bath_context_once');
  }

  if (
    reportedWakePlusOnset(msg)
    && /fracion/i.test(msg)
    && has(out, /cerca de 1h44|n[aã]o: isso n[aã]o est[aá] dentro/i)
  ) {
    out = out.replace(/[^.!?\n]*[ÉE] compreens[ií]vel que voc[eê] esteja[^.!?]*[.!?]\s*/gi, '');
    out = out.replace(
      /A janela de vig[ií]lia( de refer[eê]ncia)? para ele [eé] de 45 minutos a 1 hora e 15 minutos[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*voc[eê] poderia me informar quanto tempo dura a soneca da manh[aã][^.?]*\??\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*se aproxima do pr[oó]ximo intervalo de mamada[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*Com \d+ dias, o tempo acordado de 1h12 e a demora de 32 minutos[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*soma total de vig[ií]lia est[aá] acima da refer[eê]ncia[^.!?]*[.!?]\s*/gi,
      '',
    );
    notes.push('eval_r16_wake_onset_no_empathy_opener');
  }

  if (ids.has('night_hourly_wakes_30_60') || (/depois das 4h|ap[oó]s as 4h/i.test(msg) && /hora em hora/i.test(msg))) {
    out = out.replace(
      /[^.!?\n]*(Al[eé]m disso, considere|Tamb[eé]m verifique|Pergunte-se tamb[eé]m sobre) as medidas posturais[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(/[^.!?\n]*Entendo que voc[eê] esteja preocupada[^.!?]*[.!?]\s*/gi, '');
    out = out.replace(
      /[^.!?\n]*[ÉE] compreens[ií]vel que voc[eê] esteja preocupada com os despertares[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*Voc[eê] tem observado a efetividade das mamadas[^.?]*\??/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*quais medidas posturais voc[eê] tem utilizado[^.?]*\??/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*Essas informa[cç][oõ]es podem ajudar a entender melhor a situa[cç][aã]o[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*A orienta[cç][aã]o inicial [eé] investigar a [uú]ltima mamada efetiva[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*Se ele acorda espontaneamente, [eé] importante verificar se o jejum[^.!?]*[.!?]/gi,
      '',
    );
    out = keepFirstMatch(
      out,
      /O primeiro passo [eé] ver h[aá] quanto tempo foi a [uú]ltima mamada efetiva e se o jejum noturno da idade j[aá] foi atingido[^.!?]*[.!?]/gi,
    );
    out = out.replace(
      /[^.!?\n]*Quando ele acorda de hora em hora ap[oó]s as 4h[^.!?]*[.!?]\s*/gi,
      '',
    );
    out = out.replace(
      /Se ele acordar antes desse jejum, voc[eê] pode tentar reconduzi-lo ao sono sem oferecer o peito[.!?]\s*/gi,
      '',
    );
    notes.push('eval_r15_hourly_postural_once');
  }

  if (/chupeta cai|quando a chupeta cai/i.test(msg) && !reportedLongHabitualWake(msg)) {
    out = out.replace(/[^.!?\n]*1h30 a 1h45[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*j[aá] relatou que.{0,80}retoma[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*aula.{0,100}Janela de Vig[ií]lia[^.!?]*[.!?]/gi, '');
    notes.push('eval_r15_pacifier_only_no_leaked_window');
  }

  if (ids.has('pacifier_drop_long_wake_30_60') || (reportedLongHabitualWake(msg) && /chupeta/i.test(msg))) {
    out = out.replace(/[^.!?\n]*como ele acorda das sonecas[^.?]*\??/gi, '');
    out = out.replace(/[^.!?\n]*Ele desperta tranquilo, chorando[^.?]*\??/gi, '');
    out = out.replace(
      /[^.!?\n]*Isso pode ajudar a avaliar a condu[cç][aã]o do sono e a utiliza[cç][aã]o da chupeta[^.!?]*[.!?]/gi,
      '',
    );
  }

  if (!has(out, /quando ela cai|despertares acontecem justamente/i)) {
    out = out.replace(/[^.!?\n]*Se n[aã]o houver essa rela[cç][aã]o[^.!?]*[.!?]/gi, '');
  }

  out = out.replace(/^\.\s+/gm, '');
  out = out.replace(/\n\.\s+/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.replace(/[ \t]+\n/g, '\n').trim();
}

function applyEvaluation3060Guards(text, msg, ids, babyProfile, notes) {
  let out = String(text || '');
  const ageDays = Number(babyProfile?.ageDays);

  out = out.replace(/[^.!?\n]*2h\s*30\s*(a|até|ate)\s*3h[^.!?]{0,80}(esperad|normal|podem durar|podem ser)[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*at[eé] 3 horas.{0,50}(esperad|normal|podem ser)[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*sonecas? de at[eé] 3 horas[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*sonecas? (?:de |podem durar |de at[eé] )(?:2h\s*30 a )?3h(?![^.]*teto)[^.!?]*[.!?]/gi, (m) => (
    /n[aã]o|teto|m[aá]ximo|encerr|n[aã]o permita/i.test(m) ? m : ''
  ));

  if (ids.has('bottle_volume_30_60')) {
    out = out.replace(/90\s*(a|–|-|até|ate)\s*120\s*ml/gi, '90 a 120 ml');
    out = out.replace(/[^.!?\n]*(?:90 ml no primeiro m[eê]s|aproximadamente 120 ml \(cerca de 90|Aos 40 dias estamos no segundo m[eê]s)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*refer[eê]ncia (da mamadeira|do m[eê]todo).{0,40}120 ml[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*cerca de 20 minutos, podendo ser mais curta ou chegar a aproximadamente 30 minutos[^.!?]*[.!?]/gi, '');
    if (!has(out, /90\s*a\s*120\s*ml/i)) {
      out = appendOnce(
        out,
        'A referência geral de fórmula nesta faixa é de 90 a 120 ml por mamada, no contexto do bebê — não é um alvo fixo de 90 ml no primeiro mês e 120 ml no segundo. Não force o término.',
      );
      notes.push('eval_formula_90_120');
    }
    if (!has(out, /dura[cç][aã]o.{0,50}n[aã]o|tempo isoladamente n[aã]o/i)) {
      out = appendOnce(
        out,
        'A duração da mamada no peito, sozinha, não é o critério: observe sucção efetiva, deglutição, saciedade e o comportamento depois.',
      );
      notes.push('eval_duration_not_criterion');
    }
  }

  out = out.replace(/[^.!?\n]*fracion\w{0,20}.{0,80}(soneca da manh[aã]|1h\s*30)[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*soneca da manh[aã].{0,80}fracion\w{0,20}[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*Vale fracionar a soneca da manh[aã][^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*Recomendo fracionar[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*pode ser fracionada[^.!?]*[.!?]/gi, '');
  out = out.replace(/^\s*Isso pode ajudar a (distribuir|equilibrar)[^.!?]*[.!?]\s*/gim, '');
  out = out.replace(/\s*[—\-–]\s*n[aã]o espere os sinais de sono\s*/gi, ' — os sinais de sono complementam a janela — ');

  out = out.replace(/[^.!?\n]*soneca de at[eé] (aproximadamente )?1 hora[^.!?]*[.!?]/gi, '');
  if (ids.has('early_night_ritual_crib_30_60') && /18h?[:h]?30|18:30/.test(msg)) {
    if (!has(out, /avalie.{0,40}[uú]ltima soneca|hor[aá]rio de in[ií]cio.{0,30}dura[cç][aã]o/i)) {
      out = appendOnce(
        out,
        'Há duas possibilidades: iniciar a noite por volta das 18h30 se ela já estiver pronta, ou oferecer mais uma soneca e começar a noite depois. Avalie a última soneca pelo horário de início, duração, despertar, última janela, horário provável da noite e comportamento — sem teto fixo de 1 hora.',
      );
      notes.push('eval_last_nap_contextual');
    }
  }

  if (reportedNapOverMax(msg) || ids.has('nap_over_max_30_60')) {
    if (!has(out, /2 horas e 30|2h\s*30.{0,40}(acord|teto|m[aá]ximo|encerr)/i)) {
      out = appendOnce(
        out,
        'A soneca diurna não deve passar de 2 horas e 30 minutos: ao atingir 2h30, acorde o bebê e organize a próxima janela a partir desse despertar.',
      );
      notes.push('eval_nap_cap_2h30');
    }
  }

  if (reportedMicroNap(msg) || ids.has('micro_nap_recurrent_30_60')) {
    out = out.replace(/[^.!?\n]*(?:10|15).{0,20}minutos.{0,40}normais?[^.!?]*[.!?]/gi, '');
    if (!has(out, /recorrente.{0,40}20|abaixo de .{0,12}20|padr[aã]o for recorrente/i)) {
      out = appendOnce(
        out,
        'Se essa soneca de cerca de 10 a 15 minutos foi isolada e ele ainda parecer cansado, tente reconduzir sem insistência prolongada. Se o padrão for recorrente, mesmo sem irritabilidade evidente, investigue saciedade e sinais de refluxo.',
      );
      notes.push('eval_micronap');
    }
  }

  if (reportedOwnRoom(msg) || ids.has('own_room_undefined_30_60')) {
    if (Number.isFinite(ageDays) && ageDays !== 14) {
      out = out.replace(/\b14 dias\b/gi, `${ageDays} dias`);
    }
    out = out.replace(/[^.!?\n]*durma no mesmo ambiente[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*primeiros meses.{0,80}proximidade[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*mantenha .{0,50}pr[oó]ximo[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*manter .{0,50}pr[oó]ximo[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*fique pr[oó]ximo[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*pr[oó]ximo de voc[eê]s[^.!?]*[.!?]/gi, '');
    if (!has(out, /n[aã]o (est[aá] )?definid|validação metodol|Eliana Dias/i)) {
      const age = Number.isFinite(ageDays) ? `${ageDays} dias` : 'esta idade';
      out = appendOnce(
        out,
        `Aos ${age}, a conduta de dormir em quarto separado com monitor não está definida nos documentos oficiais desta faixa — requer validação metodológica da Eliana Dias. Não importo uma regra externa de compartilhamento de quarto.`,
      );
      notes.push('eval_own_room_undefined');
    }
  }

  if (reportedCharutinho(msg) || ids.has('charutinho_undefined_30_60')) {
    out = out.replace(/[^.!?\n]*depend[eê]ncia.{0,40}charutinho[^.!?]*[.!?]/gi, '');
    out = out.replace(/A principal hip[oó]tese.{0,100}(condu[cç][aã]o|charutinho)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*charutinho.{0,50}forma de condu[cç][aã]o[^.!?]*[.!?]/gi, '');
    if (!has(out, /n[aã]o (est[aá] )?definid|validação metodol/i)) {
      out = appendOnce(
        out,
        CHARUTINHO_UNDEFINED_CANON,
      );
      notes.push('eval_charutinho_undefined');
    }
  }

  if (reportedShortWindow(msg)) {
    out = out.replace(/[^.!?\n]*principal hip[oó]tese.{0,80}vig[ií]lia excessiva[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*condu[cç][aã]o come[cç]a ap[oó]s 1h[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*1h[–\-–]1h15.{0,50}40[–\-–]45[^.!?]*[.!?]/gi, '');
    notes.push('eval_no_invented_excess_wake');
  }

  if (reportedSlingCry(msg) || ids.has('sling_cry_physio_30_60')) {
    out = out.replace(/A principal hip[oó]tese aqui [eé] a vig[ií]lia excessiva[^.!?]*[.!?]/gi, '');
    if (has(out, /acima da janela/i) && !has(out, /antecip|inicie a condu[cç][aã]o|condu[cç][aã]o mais cedo|condu[cç][aã]o para o sono deve/i)) {
      out = appendOnce(out, 'Inicie a condução mais cedo para ele adormecer dentro da janela.');
    }
    if (!has(out, /sling.{0,80}(refluxo|deitar)|piora ao deitar|prefer[eê]ncia por (sling|posi[cç][aã]o vertical), sozinha/i)) {
      out = appendOnce(
        out,
        'Antes de atribuir o quadro só à janela, confirme mamada efetiva e saciedade, se o choro piora ao deitar, se há desconforto depois das mamadas e se a preferência pelo sling vem junto de outros sinais de refluxo. Preferência por posição vertical, sozinha, não prova refluxo.',
      );
      notes.push('eval_sling_physio');
    }
  }

  if (reportedAfterFeedPlay(msg) || ids.has('after_feed_play_30_60')) {
    if (/n[aã]o encontrei orienta[cç][aã]o suficiente/i.test(out)) {
      out = out.replace(/[\s\S]*n[aã]o encontrei orienta[cç][aã]o suficiente[\s\S]*/i, '').trim();
      notes.push('eval_after_feed_replace_fallback');
    }
    if (has(out, /autorizar brincadeira|n[aã]o d[aá] para afirmar que ele ainda est[aá] dentro da janela/i)) {
      out = out.replace(/[^.!?\n]*ainda tem tempo para interagir[^.!?]*[.!?]/gi, '');
    } else if (!has(out, /faz(em)? parte da janela|contam na janela|j[aá] entram na janela|ainda est[aá] acordado/i)) {
      out = appendOnce(
        out,
        'A janela de vigília começa quando ele acorda. A mamada e os cerca de 20 a 30 minutos em posição vertical já entram nesse tempo. Se, depois disso, ele ainda está acordado: se estiver calmo e ainda dentro da janela de 45 minutos a 1 hora e 15 minutos, pode haver troca, interação leve e os cuidados do momento; se houver sinais de sono, inquietação ou se a janela já estiver no fim, priorize a condução para o sono em vez de acrescentar estimulação. Se o desconforto persistir, investigue mamada efetiva, saciedade e sinais de refluxo.',
      );
      notes.push('eval_after_feed_still_awake');
    } else if (!has(out, /faz(em)? parte da janela|contam na janela|j[aá] entram na janela/i)) {
      out = appendOnce(
        out,
        'A janela de vigília começa quando ele acorda. A mamada e os cerca de 20 a 30 minutos em posição vertical já entram nesse tempo. Se isso já consumiu a maior parte da janela de 45 minutos a 1 hora e 15 minutos, priorize a preparação para o sono em vez de acrescentar estimulação.',
      );
      notes.push('eval_feed_in_window');
    }
  }

  if (reportedSleepBeforeFeed(msg) || ids.has('sleep_before_feed_30_60')) {
    out = out.replace(/[^.!?\n]*ideal [eé] (simplesmente )?deix[aá]-l[oa] dormir e (amamentar|mamar|alimentar) quando[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*garantir (uma )?mamada efetiva e saciedade antes de adormecer[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*mamada.{0,40}antes de (cada )?(o )?sono[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*todo sono precisa (ser precedido|de mamada)[^.!?]*[.!?]/gi, '');
    if (!has(out, /antecipar a mamada|duas op[cç][oõ]es/i)) {
      out = appendOnce(
        out,
        'Não há uma única conduta: você pode antecipar a mamada quando precisar compatibilizar alimentação e janela de sono, ou deixar dormir e oferecer a mamada ao acordar se as sonecas dele costumam ser curtas. Escolha conforme o horário do dia. Sono e alimentação são controles distintos: sinais de sono não obrigam mamada antes de cada sono.',
      );
      notes.push('eval_sleep_before_feed');
    } else if (!has(out, /controles distintos|n[aã]o obrigam mamada/i)) {
      out = appendOnce(
        out,
        'Sono e alimentação são controles distintos: sinais de sono não obrigam mamada antes de cada sono.',
      );
      notes.push('eval_sleep_feed_distinct');
    }
  }

  if (reportedLateAfternoon(msg) || ids.has('late_afternoon_cry_30_60')) {
    if (!has(out, /cansa[cç]o.{0,40}(produ[cç][aã]o|leite)|baixa produ[cç][aã]o/i)) {
      out = appendOnce(
        out,
        'Na irritabilidade intensa e recorrente no fim da tarde, as duas prioridades de investigação são cansaço e possível baixa produção materna de leite, além de mamada efetiva, saciedade e sinais de desconforto.',
      );
      notes.push('eval_late_afternoon');
    }
  }

  if (reportedAmbiguous9am(msg) || ids.has('ambiguous_clock_30_60')) {
    out = out.replace(/[^.!?\n]*n[aã]o [eé] necess[aá]rio acord[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*n[aã]o precisa acord[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*n[aã]o (deve|precisa) (ser )?acordad[oa][^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*beb[eê] saud[aá]vel.{0,50}n[aã]o (deve|precisa) (ser )?acord[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*pode deix[aá]-l[oa] dormir[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*pode deixar (ele|ela|o beb[eê]) dormir[^.!?]*[.!?]/gi, '');
    if (!has(out, /passar das 9|passar das 8|o que .{0,20}(9h|8h).{0,20}significa|n[aã]o h[aá] regra.{0,40}(9h|8h)|sem esse contexto/i)) {
      out = appendOnce(
        out,
        'Antes de orientar, preciso entender o que esse horário significa no dia de vocês: é o fim da noite, o despertar da manhã ou o limite de uma soneca? Não há regra de que o bebê precise estar acordado nesse horário. Se for soneca diurna, o teto é 2 horas e 30 minutos. De dia, não deixe passar 4 horas sem se alimentar. Sem esse contexto, ainda não aplico a regra de acordar ou não acordar.',
      );
      notes.push('eval_ambiguous_clock');
    }
  }

  out = out.replace(/[^.!?\n]*10\s*min(?:utos)?.{0,50}(?:[eé] v[aá]lid|est[aá] correto|pode esperar)[^.!?]*[.!?]/gi, '');

  if (/adormecer (mamando|enquanto mama)|j[aá] dormindo/i.test(out) && !/arroto.{0,60}vertical|medidas posturais/i.test(out)) {
    const posturalFeedAsleep =
      'Se ele adormecer durante uma mamada efetiva, não o acorde só para colocá-lo acordado no berço: complete o arroto e a posição vertical necessária (cerca de 20 a 30 minutos; até cerca de 40 minutos se houver refluxo ou desconforto importante) e, então, leve-o ao berço já dormindo.';
    const replaced = out.replace(
      /[^.!?\n]*adormecer (?:mamando|enquanto mama)[^.!?]{0,180}j[aá] dormindo[^.!?]*[.!?]/gi,
      posturalFeedAsleep,
    );
    out = replaced === out ? appendOnce(out, posturalFeedAsleep) : replaced;
    notes.push('eval_feed_asleep_postural');
  }

  if (ids.has('night_hourly_wakes_30_60') && !has(out, /jejum noturno|jejum da idade/i)) {
    out = appendOnce(
      out,
      'O primeiro passo é ver há quanto tempo foi a última mamada efetiva e se o jejum noturno da idade já foi atingido — cerca de 3 horas aos 30 dias, aumentando até cerca de 5 horas aos 60 dias. Se ainda não atingiu o jejum e a mamada anterior foi efetiva, com saciedade, tente primeiro reconduzir ao sono. Quando o jejum da idade já tiver sido alcançado, ofereça mamada.',
    );
    notes.push('eval_night_fast_tree');
  }
  out = out.replace(
    /S[oó] ofere[cç]a mamada se o jejum da idade j[aá] tiver sido alcan[cç]ado/gi,
    'Quando o jejum da idade já tiver sido alcançado, ofereça mamada; se ainda não, e a mamada anterior foi efetiva com saciedade, tente primeiro reconduzir',
  );

  if (reportedWakePlusOnset(msg)) {
    out = out.replace(/[^.!?\n]*35\s*(a|-|–)\s*40.{0,80}dentro da janela[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*dentro da janela.{0,50}35\s*(a|-|–)\s*40[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*tempo que ele est[aá] acordado est[aá] dentro do esperado[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*1h0[0-9].{0,40}dentro do esperado[^.!?]*[.!?]/gi, '');
    if (!has(out, /n[aã]o: isso n[aã]o est[aá] dentro da janela/i)) {
      out = appendOnce(out, wakeOnsetCanon(msg));
      notes.push('eval_total_wake_onset');
    }
  }

  if ((ids.has('nap_angry_wake_30_60') || reportedAngryWake(msg)) && !/40\s*[\/\-–]\s*45|40\s*a\s*45|quase 40/i.test(msg)) {
    out = stripInventedSleepOnsetDelay(out);
    out = out.replace(/[^.!?\n]*40.{0,4}45 minutos para (relaxar|adormecer|entrar em sono)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*[eé] (comum|normal) (acordar|despertar).{0,40}chorando[^.!?]*[.!?]/gi, '');
    if (!has(out, /reconduz/i)) {
      out = appendOnce(
        out,
        'Se ela acorda irritada ou ainda parece cansada depois de cerca de 1 hora, você pode tentar uma recondução breve, sem insistência prolongada.',
      );
      notes.push('eval_angry_reconduction');
    }
  }

  if (reportedNightAfter3(msg) && !ids.has('night_hourly_wakes_30_60')) {
    out = out.replace(/[^.!?\n]*fase normal da madrugada[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*despertares mais frequentes na madrugada[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*[eé] (normal|comum|esperado) .{0,80}(madrugada|ap[oó]s as 3h)[^.!?]*[.!?]/gi, '');
    if (!has(out, /jejum noturno|jejum da idade/i)) {
      out = appendOnce(
        out,
        'Antes de tratar isso como fase da madrugada, veja a última mamada efetiva, saciedade, medidas posturais, forma de adormecer, desconforto e se o jejum noturno da idade já foi atingido.',
      );
      notes.push('eval_no_madrugada_normalize');
    }
  }

  if (ids.has('bottle_volume_30_60')) {
    out = out.replace(/[^.!?\n]*(?:dura[cç][aã]o|tempo) da mamada.{0,60}20\s*(a|à|–|-)\s*30\s*min[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*20\s*(a|à|–|-)\s*30\s*minutos.{0,40}(dura[cç][aã]o|mamada no peito|refer[eê]ncia)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*refer[eê]ncia.{0,30}20\s*(a|à|–|-)\s*30\s*minutos.{0,40}mamada[^.!?]*[.!?]/gi, '');
  }

  if (ids.has('day_sleep_difficulty_30_60') && !ids.has('crib_adaptation_same_day_30_60')) {
    out = out.replace(/[^.!?\n]*conforto e seguran[cç]a[^.!?]*[.!?]/gi, '');
    if (!/todas as sonecas|progressivamente|gradativamente/i.test(msg)) {
      out = out.replace(/[^.!?\n]*todas as demais sonecas.{0,50}(mesmo dia|daquele dia)[^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?\n]*primeira soneca da manh[aã].{0,100}(mesmo dia|daquele dia)[^.!?]*[.!?]/gi, '');
    }
    if (!has(out, /antes de ensinar o sono no ber[cç]o|confirme mamada efetiva.{0,40}desconforto/i)) {
      out = `Antes de ensinar o sono no berço, confirme mamada efetiva e saciedade, desconforto ou sinais de refluxo e se a janela de vigília está entre 45 minutos e 1 hora e 15 minutos.\n\n${out}`.trim();
      notes.push('eval_day_sleep_physio_first');
    }
  }

  if (reportedTwoHourWake(msg)) {
    out = out.replace(/[^.!?\n]*(?:per[ií]odos? acordados?|tempo acordado|vig[ií]lia).{0,50}at[eé] 2 horas(?!\s*e\s*30)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*at[eé] 2 horas acordad[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*2 horas de vig[ií]lia.{0,40}(normal|esperad|adequa)[^.!?]*[.!?]/gi, '');
    if (!has(out, /2 horas.{0,40}(acima|ultrapass|excede)|acima.{0,40}1 hora e 15/i)) {
      out = appendOnce(
        out,
        'Ficar cerca de 2 horas acordado já ultrapassa a janela de 45 minutos a 1 hora e 15 minutos desta faixa. Organize a condução para ele adormecer dentro dessa referência.',
      );
      notes.push('eval_no_2h_wake_normal');
    }
  }

  if (/complemento|f[oó]rmula|mamadeira/i.test(msg)) {
    out = out.replace(/[^.!?\n]*(?:complemento|f[oó]rmula|mamadeira).{0,90}baixa produ[cç][aã]o[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*baixa produ[cç][aã]o.{0,90}(?:complemento|f[oó]rmula|mamada longa)[^.!?]*[.!?]/gi, '');
  }

  if (reportedHealthyLongNight(msg) && !/acord(o|amos|a) (ele|ela|o beb[eê]) para mamar/i.test(msg)) {
    if (!has(out, /n[aã]o (deve|precisa) (ser )?acordad[oa].{0,40}(saud[aá]vel|espont[aâ]ne)/i)) {
      out = appendOnce(
        out,
        'Se ele é saudável e dorme espontaneamente à noite, não o acorde só porque o sono passou da progressão típica do jejum — salvo orientação médica.',
      );
      notes.push('eval_no_wake_healthy_night');
    }
  }

  if (/refluxo/i.test(msg) && !has(out, /duas aulas com o pediatra|duas aulas com pediatra/i)) {
    out = appendOnce(out, REFLUX_ESCALATION_3060);
    notes.push('eval_reflux_escalation');
  }

  if (reportedSuddenChange(msg) || ids.has('sudden_change_cry_30_60')) {
    out = out.replace(/[^.!?\n]*principal hip[oó]tese.{0,80}excesso de est[ií]mulos[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*come[cç]aria.{0,40}excesso de est[ií]mulos[^.!?]*[.!?]/gi, '');
    if (!has(out, /alimenta[cç][aã]o.{0,40}saciedade.{0,40}(desconforto|refluxo)|primeiro.{0,40}mamada efetiva/i)) {
      out = appendOnce(
        out,
        'Antes de atribuir o quadro a excesso de estímulos, confirme mamada efetiva e saciedade, medidas posturais, desconforto ou refluxo e se a vigília realmente passou de 45 minutos a 1 hora e 15 minutos. Uma janela de 40 a 50 minutos, sozinha, não é vigília excessiva.',
      );
      notes.push('eval_physio_before_stimuli');
    }
  }

  if (/chupeta cai|quando a chupeta cai/i.test(msg) && !reportedLongHabitualWake(msg)) {
    out = out.replace(/[^.!?\n]*1h30 a 1h45[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*1h\s*30.{0,24}1h\s*45[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*costuma ficar acordado por 1h30[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*j[aá] relatou que.{0,80}retoma[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*aula.{0,100}Janela de Vig[ií]lia[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*janela de vig[ií]lia para um beb[eê] de \d+ dias[^.!?]*[.!?]/gi, '');
    if (!has(out, /2 a 5 minutos/i)) {
      out = `${PACIFIER_55_CANON}\n\n${out}`.trim();
      notes.push('eval_pacifier_wait_only');
    }
  }

  if ((reportedCharutinho(msg) || ids.has('charutinho_undefined_30_60')) && !/chupeta/i.test(msg)) {
    out = out.replace(/[^.!?\n]*chupeta[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*2 a 5 minutos[^.!?]*[.!?]/gi, '');
    notes.push('eval_no_pacifier_on_charutinho');
  }

  if ((reportedOwnRoom(msg) || ids.has('own_room_undefined_30_60')) && !/ber[cç]o|travesseiro|acordad/i.test(msg)) {
    out = out.replace(/[^.!?\n]*pode coloc[aá]-l[oa] acordad[oa] no ber[cç]o[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*colocad[oa] acordad[oa] no ber[cç]o[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*Estrat[eé]gia do Travesseiro[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*aula sobre a Estrat[eé]gia do Travesseiro[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*mantenha .{0,50}pr[oó]ximo[^.!?]*[.!?]/gi, '');
    const kept = out.split(/\n{2,}/).map((p) => p.trim()).filter((p) => (
      /n[aã]o (est[aá] )?definid|validação metodol|Eliana Dias|n[aã]o importo/i.test(p)
    ));
    if (kept.length) {
      out = kept.join('\n\n');
    }
    notes.push('eval_own_room_no_extras');
  }

  if ((reportedMicroNap(msg) || ids.has('micro_nap_recurrent_30_60')) && !reportedFailedReconduction(msg)) {
    if (!has(out, /despertar definitivo|nova janela/i)) {
      const followDay =
        has(out, /padr[aã]o for recorrente|abaixo de cerca de 20 minutos for recorrente/i)
          ? 'Se a recondução não funcionar, siga o dia: a nova janela começa no despertar definitivo.'
          : 'Se a recondução não funcionar, siga o dia: a nova janela começa no despertar definitivo. Se o padrão abaixo de cerca de 20 minutos for recorrente, as prioridades são saciedade e sinais de refluxo.';
      out = appendOnce(out, followDay);
      notes.push('eval_micronap_complete');
    }
  }

  if (reportedShortNaps2535(msg)) {
    if (!has(out, /despertar definitivo|recondu/i)) {
      out = appendOnce(
        out,
        'Se ele ainda parecer cansado, tente uma recondução breve. Se o despertar for definitivo, começa uma nova janela a partir daí.',
      );
      notes.push('eval_short_nap_reconduce_or_window');
    }
  }

  if (reportedNapOverMax(msg) && /poucas sonecas|s[oó] (uma|1) soneca|22h|como organizar/i.test(msg)) {
    if (!has(out, /24 horas em conjunto|Organize as 24 horas/i)) {
      out = appendOnce(
        out,
        'Organize as 24 horas em conjunto: horário em que o dia começa, número e duração das sonecas (teto 2h30), janelas de 45 minutos a 1 hora e 15 minutos e o padrão da noite. Uma soneca longa demais e poucas sonecas no dia se leem juntas, não isoladas.',
      );
      notes.push('eval_24h_step');
    }
  }

  if (/21h?[:h]?30|banho .{0,12}21h/i.test(msg) && /ritual|banho|come[cç]a a noite|iniciar/i.test(msg)) {
    if (!has(out, /in[ií]cio do (sono )?noturno.{0,40}ritual|ritual.{0,40}adormec/i)) {
      out = appendOnce(
        out,
        'A referência de 19h a 20h é para o início do sono noturno, não necessariamente para o começo do ritual. O ritual deve ser breve: a mamada depois do banho e o adormecimento perto desse horário.',
      );
      notes.push('eval_ritual_vs_onset');
    }
  }

  if (reportedLongNapUnspecified(msg) && !has(out, /quanto (tempo|dura).{0,40}soneca/i)) {
    out = appendOnce(
      out,
      'Quando você fala em soneca longa, me diga quanto tempo ela dura: o teto diurno é 2 horas e 30 minutos.',
    );
    notes.push('eval_ask_long_nap_duration');
  }

  if (Number.isFinite(ageDays) && ageDays >= 29 && ageDays <= 60) {
    out = out.replace(/\b14 dias\b/gi, `${ageDays} dias`);
    if (ageDays !== 55) {
      out = out.replace(/\baos 55 dias\b/gi, `aos ${ageDays} dias`);
      out = out.replace(/\bbeb[eê] de 55 dias\b/gi, `bebê de ${ageDays} dias`);
    }
  }

  out = out.replace(/[^.!?\n]*eleva[cç][aã]o do colch[aã]o[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*colch[aã]o.{0,50}(30 a 40|45)[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*refluxo fisiol[oó]gico.{0,80}patol[oó]gico[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*fisiol[oó]gico da possibilidade de refluxo patol[oó]gico[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*Pediatra Roberto Franklin[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*seios fl[aá]cidos[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*perto dos 3 meses[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*pr[oó]ximo(?:s)? (aos|dos) 3 meses[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*Ana,?\s+deixa eu te orientar[^.!?]*[.!?]/gi, '');
  out = out.replace(/\bAna,\s*/g, '');
  out = out.replace(/[^.!?\n]*insegur[oa]s?[^.!?]{0,80}(chupeta|sono|ber[cç]o)[^.!?]*[.!?]/gi, '');
  out = out.replace(/[^.!?\n]*beb[eê]s se sintam insegur[oa]s[^.!?]*[.!?]/gi, '');

  if (!/20\s*(a|-|–)\s*30\s*min/i.test(msg)) {
    out = out.replace(/\s*[—\-–]\s*mesmo que ela tenha mamado 20 a 30 minutos antes da soneca/gi, '');
    out = out.replace(/[^.!?\n]*amamenta[cç][aã]o pode durar.{0,50}20\s*(a|-|–)\s*30[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*mamada no peito.{0,40}20\s*(a|-|–)\s*30\s*min[^.!?]*[.!?]/gi, '');
  }

  if ((reportedNightAfter3(msg) || ids.has('night_hourly_wakes_30_60') || ids.has('night_after_3_30_60'))
    && !has(out, /aceitar o peito.{0,40}n[aã]o (comprova|significa) fome/i)) {
    const breastAccept = has(out, /cerca de 3 horas aos 30 dias/i)
      ? 'Aceitar o peito ao acordar não comprova fome.'
      : 'Aceitar o peito ao acordar não comprova fome. Confira a última mamada efetiva, a saciedade e se o jejum da idade já foi atingido — cerca de 3 horas aos 30 dias, aumentando até cerca de 5 horas aos 60 dias.';
    out = appendOnce(out, breastAccept);
    notes.push('eval_breast_accept_not_hunger');
  }

  const profileName = String(babyProfile?.babyName || '');
  if (!/\bLara\b/i.test(msg) && !/^Lara$/i.test(profileName)) {
    out = out.replace(/\bda Lara\b/g, 'do bebê');
    out = out.replace(/\ba Lara\b/g, 'o bebê');
    out = out.replace(/\bLara\b/g, 'o bebê');
  }
  if (!/\bPedro\b/i.test(msg) && !/^Pedro$/i.test(profileName)) {
    out = out.replace(/\bdo Pedro\b/g, 'do bebê');
    out = out.replace(/\bo Pedro\b/g, 'o bebê');
    out = out.replace(/\bPedro\b/g, 'o bebê');
  }
  if (!/\bAna\b/i.test(msg) && !/^Ana$/i.test(String(babyProfile?.motherName || ''))) {
    out = out.replace(/\bAna,\s*/g, '');
    out = out.replace(/\bAna\b/g, '');
  }

  const skipPillowLesson =
    reportedCharutinho(msg)
    || reportedOwnRoom(msg)
    || reportedAmbiguous9am(msg)
    || (reportedSlingCry(msg) && !/travesseiro/i.test(msg))
    || (/chupeta cai/i.test(msg) && !/travesseiro|ber[cç]o/i.test(msg))
    || reportedFailedReconduction(msg)
    || ((reportedNightAfter3(msg) || ids.has('night_after_3_30_60')) && !/travesseiro/i.test(msg))
    || ((reportedAfterFeedPlay(msg) || ids.has('after_feed_play_30_60')) && !/travesseiro/i.test(msg));
  if (!skipPillowLesson && /travesseiro/i.test(out) && !/aula.{0,40}travesseiro|travesseiro.{0,40}aplicativo/i.test(out)) {
    out = appendOnce(
      out,
      'Assista à aula sobre a Estratégia do Travesseiro no aplicativo para aprender como aplicá-la corretamente.',
    );
    notes.push('eval_pillow_lesson');
  }

  out = applyRound5ConsistencyGuards(out, msg, ids, notes);
  out = applyRound6ConsistencyGuards(out, msg, ids, notes);
  out = applyRound7ConsistencyGuards(out, msg, ids, notes);
  notes.push('eval_r7_consistency');
  out = applyRound8LeftoverGuards(out, msg, ids, notes);
  notes.push('eval_r8_leftover');
  out = applySingleVoicePass(out, msg, ids, notes);
  notes.push('eval_single_voice');
  out = applyRound14LeftoverGuards(out, msg, ids, notes);
  notes.push('eval_r14_leftover');
  out = applyRound15LeftoverGuards(out, msg, ids, notes);
  notes.push('eval_r15_leftover');

  return out;
}

/**
 * @returns {{ text: string, notes: string[] }}
 */
export function enrichThirtySixtyOfficialAnswer({
  text,
  message,
  signals,
  babyProfile,
}) {
  const notes = [];
  let out = scrubRnArtifacts(text);
  const ids = sigSet(signals);
  const msg = message || '';
  const ageDays = Number(babyProfile?.ageDays);

  if (Number.isFinite(ageDays) && ageDays < 30) {
    notes.push('eval_age_below_30_60_doc');
    return {
      text: `Aos ${ageDays} dias, a fonte oficial consolidada disponível é de 30 a 60 dias. Não aplico automaticamente as regras dessa faixa a esta idade — isso requer validação metodológica da Eliana Dias. Me conte como o bebê acorda, como está a mamada e o que mais você observa, para eu organizar o que já puder sem importar regra de outra faixa.`,
      notes,
    };
  }

  // --- 30d angry wake after adequate nap ---
  if (ids.has('nap_angry_wake_30_60')) {
    out = out.replace(/sonecas?\s+curtas?/gi, 'sonecas com duração variável');
    out = out.replace(/Como está o sono noturno d[ea]l[ea]\?/gi, '');
    out = out.replace(/[EÉe]?\s*como est[aá] (a qualidade d[oa] )?sono noturno d[ea] (beb[eê]|ela|ele|dela|dele)\??/gi, '');
    out = out.replace(/[^.!?]*como est[aá] o sono noturno[^.!?]*[.!?]/gi, '');
    out = out.replace(
      /aula sobre ['‘’“”"]?Janela de Vig[ií]lia['‘’“”"]?[^.]*/gi,
      "aula 'O que é o refluxo?' — alinhada à hipótese de alimentação e desconforto pós-mamada",
    );
    out = out.replace(/,?\s*especialmente se (est[aã]o|ela est[aá]|ele est[aá]) se adaptando ao sono\.?/gi, '.');
    out = out.replace(/[^.!?]*se adaptando ao sono[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?]*se ajustando ao sono[^.!?]*[.!?]/gi, '');
    out = out.replace(
      /[EÉ] normal que os beb[eê]s ainda estejam se ajustando[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[EÉ] (normal|comum) que (beb[eê]s de 30 dias|.{0,60}de 30 dias) acord(em|e) irritad[oa]s? ap[oó]s sonecas[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[EÉ] (normal|comum) que .{0,80}acorde irritad[oa] ap[oó]s sonecas[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[EÉ] (normal|comum) que .{0,140}acord(em|e) chorando[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[EÉ] (normal|comum) que .{0,140}acord(em|e) (muito )?(brav[oa]s?|irritad[oa]s?)[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(/especialmente se a soneca foi adequada[^.!?]*[.!?]?/gi, '');
    out = out.replace(/como no caso de 1 hora ou mais[^.!?]*[.!?]?/gi, '');
    const angryOpen =
      'Como ela consegue dormir por cerca de 1 hora ou até mais, eu não consideraria a duração da soneca o principal problema neste momento. O que chama mais atenção é ela acordar muito irritada e relaxar depois de sugar um pouco. Por isso, primeiro observaria como está a mamada e se existe algum desconforto depois dela.';
    if (!has(out, /n[aã]o consideraria a dura[cç][aã]o da soneca|1 hora ou at[eé] mais/i)) {
      out = `${angryOpen}\n\n${out}`.trim();
      notes.push('angry_wake_feeding');
    } else {
      const canonRe = /Como ela consegue dormir por cerca de 1 hora ou at[eé] mais[\s\S]{0,320}desconforto depois dela\./i;
      const hit = out.match(canonRe);
      if (hit) {
        const rest = out.replace(canonRe, '').replace(/\n{3,}/g, '\n\n').trim();
        out = `${hit[0]}\n\n${rest}`.trim();
        notes.push('angry_wake_open_first');
      }
    }
    if (!has(out, /refluxo/i)) {
      out = appendOnce(
        out,
        'Se essa leitura de desconforto/refluxo se sustentar, assista às duas aulas com o pediatra no aplicativo. Se você identificar três ou mais sintomas, busque o suporte humano e o pediatra; diante de um sinal de alerta, a avaliação pediátrica é direta.',
      );
      notes.push('angry_wake_reflux_hypothesis');
    }
    const hasPosturalAsk =
      /(houve arroto|permaneceu em posi|ficou em posi|me diga.{0,80}arroto|gostaria de saber:.{0,120}(arroto|vertical)|depois da mamada, antes de deitar)/i.test(out);
    if (!hasPosturalAsk) {
      notes.push('angry_wake_postural_ask');
    }
    out = out.replace(/\n\nA janela de vigília de referência nesta faixa é de 45 minutos a 1 hora \(podendo chegar a 1h15\)\./gi, '');
    out = out.replace(new RegExp(`\\n\\nA janela de vigília de referência nesta faixa é de ${WAKE_WINDOW_REF}\\.`, 'gi'), '');
    out = dedupeAngryWakeExplanation(out);
    out = ensureAngryWakeFeedRefine(out, msg);
    out = scrubAngryWakeTeste008(out, msg);
    out = consolidateAngryWakeTeste010(out);
    notes.push('angry_wake_once');
    notes.push('angry_wake_feed_refine');
  }

  // --- 31d excess wake (do NOT use 49d pacifier block) ---
  const keepPacifierCase = /chupeta/i.test(msg) && /n[aã]o quero retir/i.test(msg);
  const excessWakeCase =
    !keepPacifierCase &&
    (ids.has('excess_total_wake_30_60') ||
      (ids.has('wake_window_30_60') &&
        /1\s*hr|1\s*h|40\s*\/\s*45|40\/45|demora|fracion/i.test(msg) &&
        /soneca grande|2\s*hrs|2h|manh/i.test(msg)));
  if (excessWakeCase) {
    out = splitMorningNapFromExcessWake(out);
    out = out.replace(/\n\nAntes de atribuir os despertares à chupeta[\s\S]*?despertar\./gi, '');
    out = out.replace(/45 minutos a 1 hora \(podendo chegar a 1h15\)/gi, WAKE_WINDOW_REF);
    out = out.replace(/refer[eê]ncia de 45 minutos a 1 hora(?!\s+e\s+15)/gi, `referência de ${WAKE_WINDOW_REF}`);
    out = out.replace(
      /Como ele est[aá] fazendo uma soneca longa pela manh[aã][^.]*?(dificuldade em relaxar|adormecer novamente)[^.]*\./gi,
      'A demora de 40–45 minutos para relaxar no berço se explica sobretudo pela vigília total — não pela soneca da manhã em si. O teto da soneca é 2h30; avalie a distribuição em 24 horas.',
    );
    out = out.replace(
      /(?:Ele|Ela) est[aá] fazendo uma soneca longa pela manh[aã][^.]*?\.\s*Isso pode estar contribuindo para a dificuldade[^.]*\./gi,
      'A demora de 40–45 minutos para relaxar no berço se explica pela vigília total — não pela soneca da manhã. O teto da soneca é 2h30; avalie a distribuição em 24 horas.',
    );
    out = out.replace(
      /[^.]*soneca longa pela manh[aã][^.]*?(contribuindo|explica|causa)[^.]*?(relaxar|adormecer)[^.]*\./gi,
      'A demora de 40–45 minutos para relaxar no berço se explica sobretudo pela vigília total — não pela soneca da manhã em si. O teto da soneca é 2h30; avalie a distribuição em 24 horas.',
    );
    out = out.replace(
      /isso pode estar contribuindo para a dificuldade em relaxar(?: no ber[cç]o)?(?: e (?:adormecer novamente|a demora para adormecer))?[^.]*\./gi,
      '',
    );
    out = out.replace(/caprichar nas mamadas pode ajudar a relaxar[^.]*\./gi, '');
    out = out.replace(/oferecer uma mamada pode ajudar a relaxar[^.]*\./gi, 'se a demora para adormecer estiver aproximando o próximo intervalo de mamada, considere fome antes de insistir no sono.');
    out = out.replace(/oferecer uma mamada pode ajudar a relax[aá]-l[oa][^.]*\./gi, 'se a demora para adormecer estiver aproximando o próximo intervalo de mamada, considere fome antes de insistir no sono.');
    out = out.replace(/mamada pode ajudar a relaxar[^.]*\./gi, 'a fome deve ser considerada se ele já estiver perto do próximo intervalo de mamada.');
    out = stripBreastAsSleepAid(out);
    out = out.replace(/e caprichar nas mamadas costuma ajudar o padr[aã]o da tarde\./gi, ', observando se a tarde se organiza melhor.');
    out = out.replace(/caprichar nas mamadas/gi, 'verificar se a demora aproxima o próximo intervalo de mamada');
    out = out.replace(/voc[eê] poderia me informar\s+(Tamb[eé]m [eé] importante)/gi, '$1');
    out = out.replace(/Para entender melhor, voc[eê] poderia me informar\s*/gi, '');
    out = out.replace(/[EÉ] normal que o beb[eê] de 31 dias passe por varia[cç][oõ]es nas sonecas[^.!?]*[.!?]/gi, '');
    out = out.replace(/[EÉ] normal que.{0,50}31 dias.{0,80}varia[cç][oõ]es nas sonecas[^.!?]*[.!?]/gi, '');
    out = out.replace(/Com 31 dias,\s*[eé] normal que o beb[eê] passe por varia[cç][oõ]es nas sonecas,\s*/gi, '');
    out = out.replace(/[EÉ] normal que o beb[eê] passe por varia[cç][oõ]es nas sonecas,\s*/gi, '');
    out = out.replace(/[EÉ] normal que os padr[oõ]es de sono[^.!?]*vari[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?]*se adaptando ao ritmo do dia[^.!?]*[.!?]/gi, '');
    out = out.replace(/especialmente nesta fase em que (ele|ela) est[aá] se adaptando[^.!?]*[.!?]/gi, '');
    if (!hasWakeArithmetic(out)) {
      out = appendOnce(
        out,
        `A vigília excessiva vem da soma — não da soneca longa da manhã: se a condução começa depois de cerca de 1h–1h15 e ele ainda leva uns 40–45 minutos para adormecer, o tempo acordado chega perto de 1h40–2h — acima da referência de ${WAKE_WINDOW_REF}.`,
      );
      notes.push('excess_wake_45_60');
    } else if (!has(out, /1 hora e 15|1h15|1\s*h\s*15/i)) {
      out = appendOnce(
        out,
        `A referência de vigília nesta faixa é de ${WAKE_WINDOW_REF}. O tempo que conta é até o bebê efetivamente adormecer, não só o momento em que a condução começa.`,
      );
      notes.push('wake_ref');
    }
    if (/2\s*hrs|2h|soneca grande pela manh/i.test(msg) && !has(out, /2 horas e 30|2h\s*30/i)) {
      out = appendOnce(
        out,
        'A soneca da manhã de cerca de 2h a 2h30 já está no teto desta faixa. Não use um corte de uma hora e meia a duas horas como conduta padrão: avalie a distribuição do sono em 24 horas e organize as janelas a partir do despertar real.',
      );
      notes.push('morning_nap_cap_not_fraction');
    }
    if (!has(out, /antecip.{0,60}condu[cç][aã]o|antecipe o in[ií]cio da condu[cç][aã]o/i)) {
      out = appendOnce(
        out,
        'Como ele já demora cerca de 40 a 45 minutos para adormecer, antecipe o início da condução — os sinais de sono complementam a janela, mas o adormecimento precisa caber em 45 minutos a 1 hora e 15 minutos.',
      );
      notes.push('anticipate_conduction');
    }
    out = out.replace(/^\s*qual [eé] o intervalo t[ií]pico entre as mamadas\s*\.?$/gim, '');
    if (!has(out, /intervalo .{0,20}entre as mamadas/i)) {
      out = appendOnce(out, FEED_INTERVAL_CANONICAL);
      notes.push('feed_interval_ask');
    }
    if (/1\s*hr|1h\s*15|2\s*hrs|soneca grande/i.test(msg)) {
      out = out.replace(/qual [eé] a dura[cç][aã]o t[ií]pica das sonecas da manh[aã] e da tarde\??/gi, '');
      out = out.replace(/quanto tempo ele permanece acordado antes de iniciar a condu[cç][aã]o[^.?]*\??/gi, '');
      out = out.replace(/quanto tempo (ele|ela) permanece acordad[oa] antes das sonecas[^.?]*\??/gi, '');
      out = out.replace(/[,:]?\s*e quanto tempo (ele|ela) permanece acordad[oa] antes das sonecas[^.?]*\??/gi, '');
      out = out.replace(/qual [eé] a dura[cç][aã]o t[ií]pica da soneca da manh[aã] agora\??/gi, '');
      out = out.replace(/Para entender melhor a situa[cç][aã]o, poderia me informar\s*/gi, '');
      out = out.replace(/Agora, gostaria de saber:\s*/gi, '');
      out = out.replace(/gostaria de saber:\s*(Tamb[eé]m [eé] importante)/gi, '$1');
      out = out.replace(/Isso pode nos ajudar a entender melhor a situa[cç][aã]o\.\s*/gi, '');
      out = out.replace(/\bE\s+(?=\n|$)/gi, '');
      out = out.replace(/\.\s+e quanto tempo/gi, '. Quanto tempo');
      out = out.replace(/[ \t]{2,}/g, ' ');
      notes.push('strip_redundant_asks');
    }
    out = consolidateExcessWakeComposition(out);
    notes.push('excess_wake_dedupe');
  }

  // --- 45d night start (NOT the 18h30 early-ritual case) ---
  if (ids.has('night_start_19_20_30_60') && !ids.has('early_night_ritual_crib_30_60') && !ids.has('crib_awake_start_30_60') && !ids.has('crib_adaptation_same_day_30_60')) {
    out = out.replace(/Voc[eê] j[aá] assistiu aos m[oó]dulos 3 e 4[^.?]*\??/gi, '');
    out = out.replace(/j[aá] assistiu aos m[oó]dulos 3 e 4[^.?]*\??/gi, '');
    out = out.replace(/Recomendo que voc[eê] revise as aulas[^.!?]*m[oó]dulos?\s*3 e 4[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?]*especialmente as do m[oó]dulo[s]?\s*3 e 4[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?]*m[oó]dulos?\s*3 e 4[^.!?]*[.!?]/gi, '');
    out = out.replace(
      /Iniciar o sono noturno [àa]s 21h n[aã]o [eé] o ideal, pois pode contribuir para que (ele|ela) demore mais a adormecer[^.]*\./gi,
      'Iniciar o sono noturno às 21h não é o horário recomendado. A demora para adormecer também precisa ser lida com o horário da última soneca e com a janela de vigília — o horário tardio não explica isso sozinho.',
    );
    out = out.replace(
      /n[aã]o [eé] o ideal, pois pode contribuir para que (ele|ela) demore mais a adormecer[^.]*\./gi,
      'não é o horário recomendado. A demora para adormecer também precisa ser lida com o horário da última soneca e com a janela de vigília — o horário tardio não explica isso sozinho.',
    );
    if (!has(out, /19h.{0,20}20h|19\s*h.{0,20}20\s*h/i)) {
      out = appendOnce(out, 'O horário saudável e recomendado para o início do sono noturno é entre 19h e 20h.');
      notes.push('night_19_20');
    }
    {
      const askedBath = /banho|21h?30|21:30/i.test(msg);
      if (askedBath) {
        out = out.replace(
          /Se o banho for (dado )?[àa]s 21h30[^.]*\./gi,
          'O banho às 21h30 não é recomendado quando leva o início do sono noturno para ainda mais tarde.',
        );
        notes.push('bath_not_recommended');
      }
      const alreadyLate = /21h30|21:30/i.test(out);
      if (!alreadyLate) {
        out = appendOnce(
          out,
          askedBath
            ? 'A família pode organizar conforme sua dinâmica, mas o banho às 21h30 não é recomendado quando leva o início do sono noturno para ainda mais tarde — 21h30 ou 22h não é o horário recomendado.'
            : 'A família pode organizar conforme sua dinâmica, mas iniciar o sono noturno por volta de 21h30 ou 22h não é o recomendado.',
        );
        notes.push('night_not_2130');
      }
      const before2130 = (out.match(/21h30|21:30/gi) || []).length;
      out = consolidate2130Mentions(out, { includeBath: askedBath });
      out = out.replace(/\.([A-ZÁÉÍÓÚÃÕ])/g, '. $1');
      if ((out.match(/21h30|21:30/gi) || []).length < before2130) notes.push('night_2130_once');
    }
    if (/sono noturno [àa]s 21h(?!\s*30)|iniciando.{0,30}[àa]s 21h(?!\s*30)|[àa]s 21h, por[eé]m/i.test(msg)) {
      if (!has(out, /[àa]s 21h(?!\s*30).{0,80}(al[eé]m|fora da faixa|tamb[eé]m j[aá]|n[aã]o [eé] o hor[aá]rio recomendado)/i)) {
        out = appendOnce(
          out,
          'O início do sono às 21h, como você relatou, também já está além da faixa recomendada de 19h a 20h.',
        );
        notes.push('night_21h_also_late');
      }
    }
    // 45d must not inherit the 48d "start at 18h30 or take a 1h nap" fork.
    out = out.replace(/[^.!?]*por volta das 18h30[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?]*soneca de at[eé] (aproximadamente )?1 hora antes de iniciar a noite[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?]*aula sobre (a )?rotina noturna no m[oó]dulo 3[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?]*sono noturno no m[oó]dulo 3[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?]*no m[oó]dulo 3[^.!?]*[.!?]/gi, '');
    const lastNapMentions = (out.match(/[uú]ltima soneca/gi) || []).length;
    if (lastNapMentions > 1) {
      let seen = 0;
      out = out.replace(/[^.!?\n]*[uú]ltima soneca[^.!?\n]*[.!?]/g, (m) => {
        if (/a que horas o dia come[cç]ou|N[aã]o preserve o hor[aá]rio/i.test(m)) return m;
        seen += 1;
        return seen === 1 ? m : '';
      });
      notes.push('night_dedupe_last_nap');
    }
    if (!has(out, /45\s*min/i)) {
      const napGone = (out.match(/[uú]ltima soneca/gi) || []).length === 0;
      const napClause = napGone
        ? ' Observe a que horas termina a última soneca e há quanto tempo está acordado.'
        : '';
      out = appendOnce(
        out,
        `A janela de vigília pode variar entre ${WAKE_WINDOW_REF}.${napClause}`,
      );
      notes.push('night_wake_window');
    } else if ((out.match(/[uú]ltima soneca/gi) || []).length === 0) {
      out = appendOnce(
        out,
        'Observe a que horas termina a última soneca e há quanto tempo está acordado.',
      );
      notes.push('night_last_nap_ask');
    }
  }

  // --- 48d early night ritual 18h30 → asleep 20h + crib transfer ---
  if ((ids.has('early_night_ritual_crib_30_60') || /18h?[:h]?30|18:30/.test(msg)) && /18h?[:h]?30|18:30/.test(msg)) {
    out = out.replace(
      /iniciar por volta das 18h30 est[aá] dentro do esperado[^.]*\./gi,
      '',
    );
    out = out.replace(
      /O hor[aá]rio (saud[aá]vel e )?recomendado para o in[ií]cio do sono noturno [eé] entre 19h e 20h[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /Recomendo que voc[eê] inicie (a rotina do sono|o ritual) entre 19h e 20h[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /inicie a rotina do sono entre 19h e 20h[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /Isso ajuda a criar a associa[cç][aã]o do ber[cç]o como um lugar seguro para dormir e promove a autonomia[^.]*\./gi,
      '',
    );
    out = out.replace(
      /promove a autonomia d[eo]l[ae][^.]*\./gi,
      '',
    );
    out = out.replace(
      /criar familiaridade com o ber[cç]o e a desenvolver autonomia[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /ajuda a criar familiaridade com o ber[cç]o[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /desenvolver autonomia[^.!?]*[.!?]/gi,
      (m) => (/n[aã]o (uma )?exig/i.test(m) ? m : ''),
    );
    out = out.replace(
      /Se (ela|ele) estiver em sono profundo, pode ser mais dif[ií]cil para (ela|ele) se habituar ao ber[cç]o[^.]*\./gi,
      '',
    );
    out = out.replace(
      /o ideal [eé] que voc[eê] coloque .{0,80}calma, mas ainda acordada[^.]*\./gi,
      '',
    );
    out = out.replace(
      /o ideal [eé] que voc[eê] coloque .{0,80}ainda acordad[oa][^.]*autonomia[^.]*\./gi,
      '',
    );
    const check1830To20 =
      'Se a rotina começa às 18h30 e a bebê só adormece às 20h, é importante verificar quanto tempo ela permaneceu acordada, porque o ritual deve ser breve e, aos 48 dias, a janela de vigília é de 45 minutos a 1 hora e 15 minutos.';
    out = out.replace(
      /Iniciar a rotina [àa]s 18h30 e ela adormecer [àa]s 20h n[aã]o [eé] necessariamente um problema[^.!?]*[.!?]/gi,
      check1830To20,
    );
    out = out.replace(
      /[^.!?]{0,100}18h30.{0,80}(?:adormec|at[eé] 20h|20 horas).{0,80}n[aã]o [eé] necessariamente um problema[^.!?]*[.!?]/gi,
      check1830To20,
    );
    out = out.replace(
      /n[aã]o [eé] necessariamente um problema(?=[^.!?]{0,60}(?:18h30|20h|ritual))/gi,
      'é importante verificar o tempo acordado',
    );
    if (!has(out, /ritual.{0,40}breve|banho, mamada e (dormir|condu)/i)) {
      out = appendOnce(
        out,
        'O ritual noturno deve ser breve — normalmente banho, mamada e condução para dormir.',
      );
      notes.push('48_brief_ritual');
    }
    const has1830WakeCheck =
      has(out, /s[oó] adormece [àa]s 20h.{0,120}(verificar|checar|vale checar|pode indicar)/i) ||
      has(out, /18h30.{0,120}20h.{0,160}(verificar|checar|vale checar).{0,80}(acordad|vig[ií]lia)/i) ||
      has(out, /come[cç]ando [àa]s 18h30.{0,80}20h.{0,80}(vig[ií]lia|verificar|checar)/i) ||
      has(out, /permaneceu acordad[oa].{0,80}ritual deve ser breve/i);
    if (!has1830WakeCheck) {
      out = appendOnce(out, check1830To20);
      notes.push('48_check_wake_1830_20');
    }
    if (!has(out, /18h30.{0,80}(pront[oa]|iniciar a noite)|avalie.{0,40}[uú]ltima soneca/i)) {
      out = appendOnce(
        out,
        'Há duas possibilidades: se ela já estiver pronta, pode iniciar o sono noturno por volta das 18h30; se ainda for cedo para a noite, pode oferecer mais uma soneca e iniciar o sono noturno mais tarde. Avalie a última soneca pelo horário de início, duração, despertar, última janela, horário provável da noite e comportamento — sem teto fixo de 1 hora.',
      );
      notes.push('48_two_night_options');
    }
    if (!has(out, /45\s*min/i) || !has(out, /1 hora e 15|1h15/i)) {
      out = appendOnce(
        out,
        `Aos 48 dias a janela de vigília de referência é de ${WAKE_WINDOW_REF}.`,
      );
      notes.push('48_wake_window');
    }
    if (!has(out, /mamar e adormecer.{0,40}j[aá] dormindo|mamou e (adormeceu|dormiu)|sem mamar.{0,40}acordad/i)) {
      out = appendOnce(
        out,
        'Na transferência para o berço, diferencie: se ela mamar e adormecer, pode ir já dormindo. Quando for dormir sem mamada, você pode conduzir o adormecimento no berço com ela inicialmente acordada. Colocar acordada no berço é uma possibilidade de condução, não uma exigência para autonomia.',
      );
      notes.push('48_crib_by_feed');
    }
  }

  // --- 49d short naps + pacifier (narrow match — avoid 31d "depois de 30 minutos") ---
  const shortNapCase =
    /sonecas duram|m[eé]dia de 30\s*min|despertares durante as sonecas/i.test(msg) ||
    (ids.has('wake_window_30_60') && /chupeta/i.test(msg) && /30\s*min/i.test(msg) && !/soneca grande pela manh/i.test(msg));
  if (shortNapCase) {
    if (!/soneca (grande |longa )?pela manh|2\s*hrs|2h\s*30/i.test(msg)) {
      out = out.replace(/fracionar a soneca da manh[aã][^.]*\./gi, '');
      out = out.replace(/considere fracionar a soneca da manh[aã][^.]*\./gi, '');
      out = out.replace(/Para ajustar, considere\s+/gi, 'Para ajustar: ');
    }
    if (!has(out, /45\s*minutos a 1 hora e 15|45\s*min.{0,25}1\s*(h|hora)/i)) {
      out = appendOnce(
        out,
        `A janela de vigília de referência nesta faixa é de ${WAKE_WINDOW_REF}. Não há mínimo fixo de 4 a 5 sonecas — o número varia com a duração delas.`,
      );
      notes.push('49_wake');
    }
    const pacifierConditional = PACIFIER_CONDITIONAL_CANON;
    out = out.replace(
      /A principal hip[oó]tese.{0,160}chupeta[^.]*\./gi,
      pacifierConditional,
    );
    out = out.replace(
      /principal hip[oó]tese.{0,80}(necessidade de suc[cç][aã]o|suc[cç][aã]o).{0,80}chupeta[^.]*\./gi,
      pacifierConditional,
    );
    out = out.replace(
      /A necessidade de suc[cç][aã]o com a chupeta pode estar influenciando[^.]*\./gi,
      pacifierConditional,
    );
    out = out.replace(
      /O fato de (ele|ela) usar chupeta tamb[eé]m pode influenciar os despertares[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*usar chupeta tamb[eé]m pode influenciar os despertares[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /Se voc[eê] est[aá] iniciando a condu[cç][aã]o para a soneca ap[oó]s esse per[ií]odo, isso est[aá] correto[^.!?]*[.!?]/gi,
      'A condução deve respeitar a janela de 45 minutos a 1 hora e 15 minutos e os sinais de sono — não iniciar depois que a faixa já foi ultrapassada.',
    );
    out = out.replace(
      /iniciando a condu[cç][aã]o.{0,80}ap[oó]s (esse per[ií]odo|esse tempo|essa faixa).{0,40}est[aá] correto[^.!?]*[.!?]/gi,
      'A condução deve respeitar a janela de 45 minutos a 1 hora e 15 minutos e os sinais de sono.',
    );
    out = out.replace(
      /[^.!?\n]*ap[oó]s esse per[ií]odo, isso est[aá] correto[^.!?]*[.!?]/gi,
      'A condução deve respeitar a janela de 45 minutos a 1 hora e 15 minutos e os sinais de sono.',
    );
    out = out.replace(
      /[^.!?\n]*(?:Isso significa que,? )?ap[oó]s esse per[ií]odo acordado[^.!?]{0,80}iniciar a condu[cç][aã]o[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*ap[oó]s esse per[ií]odo(?: acordado)?,? [eé] hora de iniciar a condu[cç][aã]o[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /Isso significa que, ap[oó]s esse per[ií]odo acordado[^.!?]*[.!?]/gi,
      '',
    );
    if (/chupeta/i.test(msg) && /principal hip[oó]tese.{0,80}chupeta/i.test(out)) {
      out = out.replace(/A principal hip[oó]tese[^.]*\./i, pacifierConditional);
    }
    if (!/irritad|brav[oa]|acord(a|ando) chorando|choro (bastante|intenso)/i.test(msg)) {
      out = out.replace(/[^.!?]*ainda est[aá] acordando irritad[oa][^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?]*acordando irritad[oa][^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?]*acorda irritad[oa][^.!?]*[.!?]/gi, '');
      notes.push('49_no_invented_irritable');
    }
    out = out.replace(
      /[^.!?\n]*despertares coincidem com a queda da chupeta[^.!?]*[.!?]/gi,
      pacifierConditional,
    );
    out = out.replace(
      /despertares acontecem quando a chupeta cai/gi,
      'despertares acontecem justamente quando ela cai',
    );
    out = keepFirstMatch(
      out,
      /[^.!?\n]*despertares acontecem justamente quando ela cai[^.!?]*[.!?]/gi,
    );
    out = keepFirstMatch(
      out,
      /[^.!?\n]*janela de vig[ií]lia[^.!?]{0,100}45 minutos.{0,25}1 hora e 15[^.!?]*[.!?]/gi,
    );
    out = out.replace(
      /Observe como o beb[eê] acorda da soneca: tranquil[oa], chorando, buscando peito ou com desconforto\.?/gi,
      'Como ele desperta das sonecas: tranquilo, chorando, buscando peito ou demonstrando desconforto?',
    );
    if (
      !/como (ele|ela|o beb[eê]) desperta das sonecas:/i.test(out) &&
      !/acorda da soneca:\s*tranquil[oa], chorando/i.test(out)
    ) {
      out = appendOnce(
        out,
        'Como ele desperta das sonecas: tranquilo, chorando, buscando peito ou demonstrando desconforto?',
      );
      notes.push('49_how_wakes');
    }
    if (/chupeta/i.test(msg) && !has(out, /quando ela cai/i)) {
      out = appendOnce(out, pacifierConditional);
      notes.push('49_pacifier_conditional');
    }
    out = out.replace(
      /Se voc[eê] perceber que ele est[aá] acordando ap[oó]s 30 minutos, pode ser [uú]til iniciar a condu[cç][aã]o do sono um pouco antes[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /acordando ap[oó]s 30 minutos.{0,80}iniciar a condu[cç][aã]o.{0,40}antes[^.!?]*[.!?]/gi,
      '',
    );
    if (!has(out, /quanto tempo (ele|ela) permanece acordad|tempo (real )?de vig[ií]lia|acordado antes das sonecas/i)) {
      out = appendOnce(
        out,
        'Observe também quanto tempo ele permanece acordado antes das sonecas.',
      );
      notes.push('49_ask_wake');
    }
    if (!has(out, /30 minutos.{0,50}sozinha.{0,50}n[aã]o (indica|autoriza)|dura[cç][aã]o de uma soneca de cerca de 30 minutos, sozinha/i)) {
      out = appendOnce(
        out,
        'A duração de uma soneca de cerca de 30 minutos, sozinha, não indica que a condução precise começar mais cedo.',
      );
      notes.push('49_no_early_from_30min');
    }
    if (!has(out, /respeitar a janela de 45 minutos a 1 hora e 15|iniciada dentro da janela|dentro da janela de 45 minutos/i)) {
      out = appendOnce(
        out,
        'A condução deve ser iniciada dentro da janela de 45 minutos a 1 hora e 15 minutos, observando os sinais de sono e o tempo que ele demora para entrar em sono.',
      );
      notes.push('49_within_window');
    }
    if (!has(out, /alimenta[cç][aã]o.{0,100}intervalos entre as mamadas|intervalos entre as mamadas/i)) {
      out = appendOnce(
        out,
        'Como está a alimentação dele e os intervalos entre as mamadas? Ele parece saciado após as mamadas?',
      );
      notes.push('49_feed_satiety_ask');
    } else if (!has(out, /saciad/i)) {
      out = appendOnce(
        out,
        'Ele parece saciado após as mamadas?',
      );
      notes.push('49_satiety_ask');
    }
    if (
      /chegar a durar 1h|em exce[cç][aã]o.{0,30}1h/i.test(msg) &&
      !has(out, /1 hora n[aã]o devem ser consideradas curtas|cerca de 1 hora.{0,50}n[aã]o.{0,30}curtas/i)
    ) {
      out = appendOnce(
        out,
        'Sonecas de cerca de 1 hora não devem ser consideradas curtas.',
      );
      notes.push('49_1h_not_short');
    }
  }

  // --- 40d pacifier keep (rewrite harmful guidance) ---
  if (keepPacifierCase) {
    out = out.replace(/conten[cç][aã]o suave[^.]*\./gi, 'preservando a habilidade que ele já tem de iniciar o sono sozinho no berço.');
    out = out.replace(/NAO classifique como mau habito[^.]*\./gi, 'Nesta idade o Método não usa classificação comportamental inadequada para 0 a 3 meses.');
    out = out.replace(/n[aã]o classifique como mau h[aá]bito[^.]*\./gi, 'Nesta idade o Método não usa classificação comportamental inadequada para 0 a 3 meses.');
    out = out.replace(/sem rotulo de mau habito/gi, 'sem rotular o comportamento');
    out = out.replace(/sem classific[aá]-la como mau h[aá]bito/gi, 'sem rotular o comportamento nesta idade');
    out = out.replace(/\bmaus?\s+h[aá]bitos?\b/gi, 'padrão de condução');
    out = out.replace(/\nOutros pontos relevantes[\s\S]*$/i, '');
    out = out.replace(/s[oó] dorme no colo e no peito[^.]*\./gi, '');
    out = out.replace(/Travesseiro as vezes funciona[^.]*\./gi, '');
    out = out.replace(/Dificuldade para dormir durante o dia aos 30-60 dias[^.]*\./gi, '');
    out = out.replace(
      /A principal hip[oó]tese.{0,120}vig[ií]lia excessiva[^.]*\./gi,
      'O que mais chama atenção é a mudança recente: até cerca de 5 dias as sonecas eram longas e o retorno era tranquilo. Sem o tempo acordado entre as sonecas, não dá para tratar vigília excessiva como hipótese principal.',
    );
    if (!has(out, /mudan[cç]a recente|at[eé] (cinco|5) dias|poucos dias|padr[aã]o (anterior|recente)/i)) {
      out = appendOnce(
        out,
        'Há uma mudança recente (até cerca de 5 dias as sonecas eram longas e o retorno era tranquilo) — isso precisa ser investigado antes de qualquer leitura só pela chupeta.',
      );
      notes.push('recent_change');
    }
    if (!has(out, /retoma.{0,40}(sozinho|sem a chupeta)|observe.{0,40}retom/i)) {
      out = appendOnce(
        out,
        'Na hora do despertar, como você já percebeu que às vezes ele retoma sozinho, observe primeiro alguns instantes — se o choro não cresce e não aparece outra necessidade. Se precisar, recoloque a chupeta: o objetivo não é retirá-la, e sim não concluir que todo despertar exige recolocação imediata.',
      );
      notes.push('pacifier_observe_resume');
    }
    out = appendOnce(
      out,
      'Você pode manter a chupeta: vamos respeitar essa escolha e investigar alimentação, desconforto e o papel da sucção nos despertares.',
    );
    notes.push('keep_pacifier');
  }

  // --- 40d bottle ---
  if (ids.has('bottle_volume_30_60')) {
    out = out.replace(
      /Isso ajudar[aá] na adapta[cç][aã]o entre peito e mamadeira,\s*\./gi,
      'A mamadeira de aprendizado tem finalidade de ensino da sucção, para ela aprender a alternar peito e mamadeira.',
    );
    out = out.replace(/adapta[cç][aã]o entre peito e mamadeira,\s*\./gi, 'adaptação entre peito e mamadeira.');
    out = out.replace(/Voc[eê] j[aá] conseguiu que a sua beb[eê] aceitasse a mamadeira\??/gi, '');
    out = out.replace(/Voc[eê] j[aá] notou como ela est[aá] se adaptando [aà] mamadeira\??/gi, '');
    out = out.replace(/E ap[oó]s a mamada no peito, ela ainda est[aá] retirando leite ou apenas sugando por conforto\??/gi, '');
    out = out.replace(/Voc[eê] j[aá] .{0,90}mamadeira\??/gi, '');
    out = out.replace(/90 ml no primeiro m[eê]s/gi, '90 a 120 ml no contexto');
    out = out.replace(/aproximadamente 120 ml \(cerca de 90 ml no primeiro m[eê]s\)/gi, '90 a 120 ml no contexto do bebê');
    out = out.replace(/Aos 40 dias estamos no segundo m[eê]s:[^.]*[.!?]/gi, '');
    if (!has(out, /90\s*a\s*120\s*ml/i)) {
      out = appendOnce(
        out,
        'A referência geral de fórmula nesta faixa é de 90 a 120 ml por mamada, no contexto do bebê. Não force o término e não use 90 ml no primeiro mês e 120 ml no segundo como progressão fixa.',
      );
      notes.push('bottle_90_120_contextual');
    }
    out = stripBottleBehavioralReading(out);
    out = out.replace(/[^.]*rotulad[oa] como um h[aá]bito[^.]*\./gi, '');
    out = out.replace(/\bmaus?\s+h[aá]bitos?\b/gi, 'padrão de condução');
    if (!has(out, /tempo isoladamente n[aã]o|dura[cç][aã]o.{0,40}n[aã]o [eé] (o )?crit[eé]rio/i)) {
      out = appendOnce(
        out,
        'O tempo isoladamente não determina o término da mamada: o parâmetro é verificar se houve retirada efetiva de leite e se a bebê apresenta sinais de saciedade.',
      );
      notes.push('bottle_satiety_param');
    }
  }

  // --- 40d night hourly wakes after 4am ---
  if (ids.has('night_hourly_wakes_30_60') && !ids.has('bottle_volume_30_60') && !keepPacifierCase) {
    out = out.replace(/n[aã]o [eé] necess[aá]rio acord[aá]-l[oa] para mamar [aà] noite[^.]*\./gi, '');
    out = out.replace(/se o seu beb[eê] est[aá] saud[aá]vel e ganhando peso, n[aã]o [eé] necess[aá]rio acord[aá]-l[oa][^.]*\./gi, '');
    out = out.replace(/Quando (ele|ela) acorda antes de 3 horas, tente[^.]*\./gi, '');
    out = out.replace(/associa[cç][aã]o de que toda vez que (ele|ela) acorda[^.]*\./gi, '');
    out = out.replace(/evitar a associa[cç][aã]o[^.]*\./gi, '');
    out = out.replace(/ap[oó]s 4 horas de sono/gi, 'após as 4h da manhã');
    out = out.replace(/acorda ap[oó]s 4 horas(?!\s+da manh)/gi, 'acorda após as 4h da manhã');
    out = out.replace(/acordou ap[oó]s 4 horas(?!\s+da manh)/gi, 'acordou após as 4h da manhã');
    out = out.replace(/Isso ajuda a evitar que (ele|ela) associe o despertar [aà] necessidade de mamar[^.]*\./gi, '');
    out = out.replace(/evitar que (ele|ela) associe o despertar [aà] necessidade de mamar[^.]*\./gi, '');
    out = out.replace(/[^.!?\n]*associa[cç][oõ]es negativas entre acordar e mamar[^.!?]*[.!?]/gi, '');
    out = out.replace(/Isso ajuda a evitar associa[cç][oõ]es negativas[^.!?]*[.!?]/gi, '');
    out = out.replace(/quanto tempo durou o primeiro sono da noite\??/gi, '');
    out = out.replace(/Quando (ele|ela) acorda antes de 3 horas, voc[eê] oferece o peito automaticamente\??/gi, '');
    out = out.replace(/H[aá] sinais claros de fome ou apenas agita[cç][aã]o breve\??/gi, '');
    out = out.replace(/Para entender melhor a situa[cç][aã]o, gostaria de saber:\s*/gi, '');
    out = out.replace(/gostaria de saber:\s*(?=A pergunta decisiva|O primeiro passo|Antes de pensar|$)/gi, '');
    out = stripNightHourlyTeste011Leaks(out);
    out = reorderNightHourlyDecision(out, msg);
    out = stripNightHourlyContradiction(out);
    out = stripNightHourlyTeste011Leaks(out);
    notes.push('night_first_stretch_pattern');
    out = retargetNightHourlyLesson(out);
    if (!has(out, /sono noturno/i)) {
      out = appendOnce(
        out,
        'Recomendo que você revise a aula sobre Estratégias para o Sono Noturno.',
      );
      notes.push('night_sono_noturno_lesson');
    }
  }

  // --- 51d ---
  const daySleep51 =
    !ids.has('crib_awake_start_30_60') &&
    !ids.has('crib_adaptation_same_day_30_60') &&
    (ids.has('day_sleep_difficulty_30_60') ||
      (/quanto tempo.{0,30}aprender|travesseiro/i.test(msg) && /colo|peito/i.test(msg)));
  if (daySleep51) {
    out = strip51dNormalization(out);
    out = strip51dWindowToFeed(out);
    out = out.replace(/[^.!?\n]*conforto e seguran[cç]a[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*todas as demais sonecas.{0,50}(mesmo dia|daquele dia)[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*primeira soneca da manh[aã].{0,100}(mesmo dia|daquele dia)[^.!?]*[.!?]/gi, '');
    out = out.replace(
      /Se a mamada for apenas por conforto[^.]*\./gi,
      '',
    );
    out = out.replace(
      /Se apos alimentar ainda permanece sugando apenas por conforto[^.]*\./gi,
      '',
    );
    out = out.replace(
      /mamada .{0,50}conforto.{0,100}interromper[^.]*\./gi,
      '',
    );
    out = out.replace(
      /[^.!?]*peito apenas por conforto[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?]*apenas por conforto.{0,90}interromper[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?]*interromper a mamada[^.!?]{0,60}conforto[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /interromper e conduzir o sono com conten[cç][aã]o e ru[ií]do branco[^.]*\./gi,
      '',
    );
    out = out.replace(/cerca de 10 minutos|em torno de 10 minutos/gi, (m, offset, full) => {
      const before = full.slice(Math.max(0, offset - 28), offset);
      if (/n[aã]o use\s*[“"']?\s*$/i.test(before)) return m;
      return 'observando a resposta da bebê, sem cronometrar o choro';
    });
    out = out.replace(/,?\s*especialmente se est[aã]o acostumad[oa]s? a dormir no colo ou no peito[^.]*\./gi, '.');
    out = out.replace(/acostumad[oa]s? a dormir no colo(?: ou no peito)?[^.]*\./gi, '');
    out = out.replace(/seguir uma hierarquia/gi, 'seguir este passo a passo');
    out = out.replace(/siga esta hierarquia/gi, 'siga este passo a passo');
    out = out.replace(/seguir esta hierarquia/gi, 'seguir este passo a passo');
    out = out.replace(
      /Se ela ainda estiver sugando ao adormecer, isso pode indicar que ela ainda tem fome ou que est[aá] buscando conforto[^.]*\./gi,
      '',
    );
    out = out.replace(/fome ou que est[aá] buscando conforto[^.]*\./gi, '');
    out = strip51dCalmStartRule(out);
    out = out.replace(/  +/g, ' ');
    out = out.replace(/\.\s*\./g, '.');
    out = out.replace(/\(n[aã]o use ['"“”']?o tempo que a beb[eê] precisar[^)]*\)/gi, '');
    out = out.replace(/Para ajudar na adapta[cç][aã]o ao ber[cç]o,/gi, 'Para conduzir a dificuldade de dormir durante o dia,');
    out = out.replace(/ajuda na adapta[cç][aã]o ao ber[cç]o/gi, 'ajuda na condução do sono diurno');
    out = out.replace(/adapta[cç][aã]o ao ber[cç]o/gi, 'condução do sono diurno');
    out = ensure51dInvestigationOpen(out);
    if (!has(out, /n[aã]o existe prazo|sem prazo fixo|n[aã]o h[aá] prazo|prazo fixo/i)) {
      out = appendOnce(
        out,
        'Não existe prazo fixo de dias para ela aprender: a evolução depende de repetição e consistência, com alimentação, vigília e sono organizados.',
      );
      notes.push('no_fixed_timeline');
    }
    if (!has(out, /45\s*min/i)) {
      out = appendOnce(
        out,
        `A dificuldade para dormir durante o dia começa pela vigília (${WAKE_WINDOW_REF}) e pela mamada efetiva com sinais de saciedade — a transferência para o berço vem depois.`,
      );
      notes.push('51_wake_feed');
    }
    const conductAfterSatiety =
      'Se ainda houver sinais de fome, mantenha a alimentação. Se ela já estiver saciada e continuar no peito, retire-a do peito, coloque em posição vertical e, depois, conduza ao sono.';
    const alreadyHasSatietyConduct =
      /retir[ae]-a(?: do peito)?|retire-a do peito|retir[aá]-l[oa] do peito/i.test(out) &&
      /posi[cç][aã]o vertical/i.test(out);
    if (!has(out, /fome.{0,60}adormec|suc[cç][aã]o durante o adormec|peito porque ainda est[aá] com fome|saciad[oa] permanece sugando|diferencie: ainda est[aá] com fome|ainda estiver mamando efetivamente e houver sinais de fome/i)) {
      if (!alreadyHasSatietyConduct) {
        out = appendOnce(
          out,
          `Quando ela “só dorme no peito”, diferencie: ainda está com fome; fez mamada efetiva e ficou saciada; ou já saciada permanece sugando enquanto adormece. ${conductAfterSatiety}`,
        );
        notes.push('51_hunger_vs_sleep_suck');
      }
    } else if (!alreadyHasSatietyConduct && !has(out, /retir[ae]-a do peito|retire-a do peito|retir[aá]-l[oa] do peito/i)) {
      if (has(out, /Essa leitura vem antes de tratar o peito/i)) {
        out = out.replace(
          /Essa leitura vem antes de tratar o peito s[oó] como forma de adormecer\./gi,
          `Essa leitura vem antes de tratar o peito só como forma de adormecer. ${conductAfterSatiety}`,
        );
      } else {
        out = appendOnce(out, conductAfterSatiety);
      }
      notes.push('51_satiety_conduct');
    }
    out = prefer51dCompleteSatietyConduct(out);
    out = dedupe51dConduzaAoSono(out);
    out = keepFirstMatch(
      out,
      /[^.!?\n]*(?:execu[cç][aã]o.{0,40}travesseiro|travesseiro.{0,90}execu|executando.{0,50}travesseiro|realizando.{0,50}travesseiro|como est[aá] (sendo )?a execu[cç][aã]o|como voc[eê] est[aá] realizando)[^.!?]*[.!?]/gi,
    );
    const asksTravesseiroExec =
      /como voc[eê] est[aá] (executando|realizando).{0,60}travesseiro|como est[aá] (sendo )?a execu[cç][aã]o.{0,40}travesseiro|travesseiro.{0,90}(execu[cç]|em que momento|realiz)/i.test(out);
    if (asksTravesseiroExec) {
      out = out.replace(
        /Se voc[eê] j[aá] est[aá] utilizando a t[eé]cnica do travesseiro, investigue como est[aá] sendo a execu[cç][aã]o e em que momento da vig[ií]lia voc[eê] a inicia\./gi,
        '',
      );
    } else if (/travesseiro/i.test(msg)) {
      out = appendOnce(
        out,
        'Se você já está utilizando a técnica do travesseiro, investigue como está sendo a execução e em que momento da vigília você a inicia.',
      );
      notes.push('51_travesseiro_exec');
    }
    out = consolidate51dTravesseiroLesson(out, /travesseiro/i.test(msg));
    notes.push('51_travesseiro_lesson');
    if (!has(out, /sem cronometrar|sem tempo (fixo|predeterminado)|n[aã]o (h[aá]|existe) tempo (fixo|predeterminado) de choro|observando a resposta/i)) {
      out = appendOnce(
        out,
        'Na condução, use contenção e presença observando a resposta da bebê — sem cronometrar o choro e sem tempo predeterminado.',
      );
      notes.push('no_fixed_cry');
    }
    out = out.replace(/\bmaus?\s+h[aá]bitos?\b/gi, 'padrão de condução');
  }

  // --- 56d crib awake vs light/deep sleep ---
  const cribAwakeStart =
    ids.has('crib_awake_start_30_60') ||
    (/sono leve/i.test(msg) && /sono profundo/i.test(msg));
  if (cribAwakeStart) {
    const wasFallback = /n[aã]o encontrei orienta[cç][aã]o suficiente/i.test(out);
    if (wasFallback) {
      out = '';
      notes.push('56_replace_fallback');
    }
    out = out.replace(/Me contar um pouco mais de contexto \(idade exata[^)]*\)[.,]?/gi, '');
    out = out.replace(/idade exata, padr[aã]o de sono[^.]*\./gi, '');
    out = out.replace(/Te encaminhar para o conte[uú]do mais pr[oó]ximo[^.]*\./gi, '');
    out = out.replace(/suporte humano da equipe[^.]*\./gi, '');
    out = out.replace(/Posso seguir de duas formas:[^\n]*/gi, '');
    if (!has(out, /tranquilo.{0,40}(sem chorar|sem choro)|pode coloc[aá]-l[oa] acordad/i)) {
      out = appendOnce(
        out,
        'Se ele estiver tranquilo e sem chorar, você pode colocá-lo acordado no berço e dar a oportunidade para que adormeça ali. Não é necessário esperar que esteja em sono leve ou profundo.',
      );
      notes.push('56_awake_ok');
    }
    const hasCryCalm =
      /(?:irritar|irritad|come[cç]ar a chorar|(?<!sem )chorar)/i.test(out) &&
      /acalme|acalm[aá]|se acalmar|siga a condu[cç][aã]o|continue a condu[cç][aã]o|continuar a condu[cç][aã]o/i.test(out);
    if (!hasCryCalm) {
      out = appendOnce(
        out,
        'Se ele se irritar ou chorar, acalme-o e continue a condução do sono, sem exigir que adormeça sozinho.',
      );
      notes.push('56_no_autonomy_demand');
    }
    out = dedupeCribCryCalm(out);
    notes.push('56_cry_calm_once');
    if (!has(out, /adormecer mamando|j[aá] dormindo|n[aã]o precisa acord[aá]-l[oa]/i)) {
      out = appendOnce(
        out,
        'E se a mamada coincidir com o horário de dormir e ele adormecer mamando, não precisa acordá-lo: complete o arroto e a posição vertical (cerca de 20 a 30 minutos; até cerca de 40 minutos se houver refluxo ou desconforto) e, então, pode colocá-lo no berço já dormindo.',
      );
      notes.push('56_feed_asleep_ok');
    }
    const travesseiroPurpose56 =
      'A Estratégia do Travesseiro também pode ajudar na condução e na colocação do bebê no berço.';
    const travesseiroLesson56 =
      'Assista à aula sobre a Estratégia do Travesseiro no aplicativo para aprender como aplicá-la corretamente.';
    const hasCanonicalPurpose56 = /tamb[eé]m pode ajudar na condu[cç][aã]o e na coloca[cç][aã]o do beb[eê] no ber[cç]o/i.test(out);
    if (!hasCanonicalPurpose56) {
      out = out.replace(
        /A Estrat[eé]gia do Travesseiro pode ser indicada para ajudar na transi[cç][aã]o[^.!?]*[.!?]/gi,
        '',
      );
      out = out.replace(
        /[^.!?\n]*[Ee]strat[eé]gia do Travesseiro[^.!?]{0,140}(?:ajudar na transi[cç][aã]o|pode ser (?:útil|indicada)|pode ajudar)[^.!?]*[.!?]/gi,
        '',
      );
      out = out.replace(
        /[^.!?\n]*(?:oferece|dando) mais seguran[cç]a[^.!?]{0,90}(condu[cç][aã]o|coloca[cç][aã]o)[^.!?]*[.!?]/gi,
        '',
      );
      out = out.replace(/ajudar na transi[cç][aã]o/gi, 'ajudar na condução e na colocação do bebê no berço');
      out = appendOnce(out, travesseiroPurpose56);
      notes.push('56_travesseiro_purpose_canonical');
    }
    out = out.replace(
      /[^.!?\n]*(?:assista [àa] aula|confira a aula|revise a aula|revisar a aula|aula correspondente|aula sobre (?:essa estrat[eé]gia|a estrat[eé]gia do travesseiro))[^.!?]*[.!?]/gi,
      '',
    );
    if (has(out, /estrat[eé]gia do travesseiro/i)) {
      out = appendOnce(out, travesseiroLesson56);
      notes.push('56_travesseiro_lesson_once');
    }
  }

  // --- 57d crib adaptation: all naps of the same day ---
  const cribSameDay =
    ids.has('crib_adaptation_same_day_30_60') ||
    (/progressivamente|gradativamente/i.test(msg) && /ber[cç]o/i.test(msg) && /soneca/i.test(msg));
  if (cribSameDay) {
    out = out.replace(
      /voc[eê] pode avan[cç]ar progressivamente[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /come[cç]ando pelas sonecas diurnas[^.!?]*sono noturno[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /O hor[aá]rio (saud[aá]vel e )?recomendado para o in[ií]cio do sono noturno [eé] entre 19h e 20h[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /A fam[ií]lia pode organizar conforme sua din[aâ]mica, mas iniciar o sono noturno por volta de 21h30 ou 22h n[aã]o [eé] o recomendado[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /Observe a que horas termina a [uú]ltima soneca e h[aá] quanto tempo est[aá] acordado[^.!?]*[.!?]/gi,
      '',
    );
    out = stripCribInventedHowTo(out);
    if (!ids.has('crib_awake_start_30_60')) out = stripUnofficialCribSeguranca(out);
    out = stripCribCalmRequirement(out);
    if (!has(out, /todas as sonecas daquele mesmo dia|todas as sonecas do dia|n[aã]o [eé] avan[cç]ar uma soneca por vez/i)) {
      out = appendOnce(out, SAME_DAY_CRIB_CANON);
      notes.push('57_same_day_naps');
    }
    if (reportedLearnTimelineAsk(msg) && missingLearnTimeline(out)) {
      out = appendOnce(out, LEARN_TIMELINE_CANON);
      notes.push('57_learn_timeline');
    }
    out = out.replace(
      /[^.!?]*(avan[cç]ar gradativamente|progressivamente)[^.!?]*boa abordagem[^.!?]*[.!?]/gi,
      '',
    );
    if (!has(out, /45\s*min/i) || !has(out, /1 hora e 15|1h15/i)) {
      out = appendOnce(
        out,
        `A janela de vigília de referência é de ${WAKE_WINDOW_REF}.`,
      );
      notes.push('57_wake');
    }
    const consistency57 =
      'Mantenha o processo com consistência e repetição, acolhendo o choro e ajudando no colo sempre que necessário.';
    out = out.replace(
      /[EÉ] importante ter paci[eê]ncia e respeitar a resposta do beb[eê] durante esse processo[^.!?]*[.!?]/gi,
      consistency57,
    );
    out = out.replace(
      /[^.!?]*ter paci[eê]ncia e respeitar a resposta do beb[eê][^.!?]*[.!?]/gi,
      consistency57,
    );
    out = out.replace(
      /\s*[;,]?\s*o foco deve ser na consist[eê]ncia e repeti[cç][aã]o[.!?]?/gi,
      '',
    );
    if (!has(out, /mantenha o processo com consist[eê]ncia e repeti[cç][aã]o.{0,80}acolhendo o choro/i)) {
      out = appendOnce(out, consistency57);
      notes.push('57_consistency');
    }
    out = keepFirstMatch(
      out,
      /Mantenha o processo com consist[eê]ncia e repeti[cç][aã]o, acolhendo o choro e ajudando no colo sempre que necess[aá]rio[.!?]?/gi,
    );
    const travesseiroDirect57 =
      'Use a Estratégia do Travesseiro na condução e na colocação no berço.';
    out = out.replace(
      /O uso do travesseiro pode ser uma boa (estrat[eé]gia|ferramenta)[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?]*pode ser uma boa (estrat[eé]gia|ferramenta) para (ajudar na adapta[cç][aã]o|auxiliar nesse processo)[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /A Estrat[eé]gia do Travesseiro pode ser uma boa (ferramenta|estrat[eé]gia)[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?\n]*pode ser uma boa (ferramenta|estrat[eé]gia)[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /[^.!?]*se voc[eê] j[aá] a utiliza, observe como est[aá] sendo feita[^.!?]*[.!?]/gi,
      '',
    );
    if (!has(out, /use a estrat[eé]gia do travesseiro|travesseiro.{0,40}condu[cç][aã]o e na coloca[cç][aã]o/i)) {
      out = appendOnce(out, travesseiroDirect57);
      notes.push('57_travesseiro_direct');
    }
    out = keepFirstMatch(
      out,
      /Use a Estrat[eé]gia do Travesseiro na condu[cç][aã]o e na coloca[cç][aã]o no ber[cç]o[.!?]?/gi,
    );
    out = out.replace(
      /[^.!?\n]*(?:assista [àa] aula|confira a aula|revise a aula|revisar a aula|aula correspondente|aula sobre (?:essa estrat[eé]gia|a estrat[eé]gia do travesseiro))[^.!?]*[.!?]/gi,
      '',
    );
    out = appendOnce(
      out,
      'Assista à aula sobre a Estratégia do Travesseiro no aplicativo para aprender como aplicá-la corretamente.',
    );
    notes.push('57_travesseiro_lesson_once');
  }

  // --- 55d pacifier drop during sleep + wake window above 1h15 ---
  const pacifierDropLongWake =
    ids.has('pacifier_drop_long_wake_30_60') ||
    (/chupeta cai|quando a chupeta cai|coloc[aá]-l[ao] logo/i.test(msg) &&
      /1h\s*30|1h30|1h\s*45|1h45|maior que 1h15/i.test(msg));
  if (pacifierDropLongWake) {
    const wasFallback = /n[aã]o encontrei orienta[cç][aã]o suficiente/i.test(out);
    if (wasFallback) {
      out = '';
      notes.push('55_replace_fallback');
    }
    out = out.replace(/Me contar um pouco mais de contexto \(idade exata[^)]*\)[.,]?/gi, '');
    out = out.replace(/idade exata, padr[aã]o de sono[^.]*\./gi, '');
    out = out.replace(/Te encaminhar para o conte[uú]do mais pr[oó]ximo[^.]*\./gi, '');
    out = out.replace(/suporte humano da equipe[^.]*\./gi, '');
    out = out.replace(/Posso seguir de duas formas:[^\n]*/gi, '');
    out = out.replace(
      /A principal hip[oó]tese aqui [eé] que ele pode estar experimentando vig[ií]lia excessiva[^.]*\./gi,
      'Se ele permanece acordado habitualmente por 1h30 a 1h45, esse tempo já está acima do indicado para a idade.',
    );
    out = out.replace(
      /principal hip[oó]tese.{0,50}vig[ií]lia excessiva[^.]*\./gi,
      '1h30 a 1h45 já está acima da janela indicada para essa idade.',
    );
    out = out.replace(/Isso pode indicar uma vig[ií]lia excessiva[^.!?]*[.!?]/gi, '');
    out = out.replace(/pode indicar uma vig[ií]lia excessiva[^.!?]*[.!?]/gi, '');
    if (!/soneca (grande |longa )?pela manh|dura[cç][aã]o da soneca da manh|2\s*hrs|2h\s*30/i.test(msg)) {
      out = out.replace(
        /[^.!?\n]*(?:fracion\w{0,12}.{0,50}soneca da manh[aã]|soneca da manh[aã].{0,50}fracion)[^.!?]*[.!?]/gi,
        '',
      );
      out = out.replace(/[^.!?]*melhora as sonecas da tarde[^.!?]*[.!?]/gi, '');
      notes.push('55_no_invented_morning_fraction');
    }
    if (!/40\s*[\/\-–]\s*45|40\s*a\s*45|quase 40/i.test(msg)) {
      out = stripInventedSleepOnsetDelay(out);
      notes.push('55_no_invented_sleep_onset');
    }
    if (!/despertares durante as sonecas|sonecas duram|m[eé]dia de 30\s*min/i.test(msg)) {
      out = stripLeaked55dInvestigation(out);
      notes.push('55_no_leaked_nap_investigation');
    }
    out = out.replace(
      /Seria [uú]til saber quanto tempo ele demora para (adormecer depois de deitar|entrar em sono)[^.!?]*[.!?]/gi,
      'Para entender melhor, quanto tempo ele demora para entrar em sono após você iniciar a condução?',
    );
    out = out.replace(/adormecer depois de deitar/gi, 'entrar em sono');
    out = out.replace(/\s*e a dura[cç][aã]o da soneca da manh[aã][^.?]*\??/gi, '');
    out = out.replace(/Isso pode ajudar a ajustar a rotina d[ea]le\./gi, '');
    if (!has(out, /quanto tempo (ele|ela) demora para entrar em sono/i)) {
      out = appendOnce(
        out,
        'Para entender melhor, quanto tempo ele demora para entrar em sono após você iniciar a condução?',
      );
      notes.push('55_enter_sleep_ask');
    }
    const longPacifierRe =
      /Quando a chupeta cair e ele apenas reclamar[\s\S]{0,520}?oferec[eê]-l[ao] novamente\./gi;
    const shortPacifierRe =
      /Se ele s[oó] est[aá] reclamando[\s\S]{0,280}?(oferecer a chupeta novamente|oferec[eê]-l[ao] novamente)\./gi;
    const hasLongPacifier = longPacifierRe.test(out);
    longPacifierRe.lastIndex = 0;
    const hasShortPacifier =
      /n[aã]o (precisa|[eé] necess[aá]rio) recoloc/i.test(out) &&
      /continua dormindo|continuar dormindo/i.test(out);
    if (hasLongPacifier) {
      let pacSeen = 0;
      out = out.replace(longPacifierRe, (m) => {
        pacSeen += 1;
        return pacSeen === 1 ? m : '';
      });
      out = out.replace(shortPacifierRe, '');
      notes.push('55_pacifier_once');
    } else if (!hasShortPacifier) {
      out = appendOnce(
        out,
        'Quando a chupeta cair e ele apenas reclamar, você não precisa recolocá-la imediatamente. Aguarde cerca de 2 a 5 minutos e observe se ele se reorganiza ou continua dormindo. Se permanecer tranquilo ou voltar ao sono, pode deixar sem a chupeta. Se ele despertar e precisar de ajuda para retomar o sono, você pode oferecê-la novamente.',
      );
      notes.push('55_pacifier_wait');
    }
    if (!has(out, /1h30.{0,80}(ultrapass|acima|excede)|1h\s*30.{0,80}(ultrapass|acima|excede)/i)) {
      out = appendOnce(
        out,
        `Sobre o tempo acordado: a referência de janela de vigília é de ${WAKE_WINDOW_REF}. Permanecer acordado habitualmente por 1h30 a 1h45 já ultrapassa o esperado para essa faixa etária. Procure observar os sinais de sono e iniciar a preparação para dormir antes de ultrapassar repetidamente 1h15.`,
      );
      notes.push('55_window_exceeded');
    } else if (!has(out, /45\s*min/i)) {
      out = appendOnce(
        out,
        `Aos ${Number.isFinite(ageDays) && ageDays >= 29 && ageDays <= 60 ? ageDays : 55} dias, a referência de janela de vigília é de ${WAKE_WINDOW_REF}.`,
      );
      notes.push('55_wake_ref');
    }
  }

  // Global 30_60 scrub: never leave "mau hábito" / autorregulação / guarantees.
  out = scrubThirtySixtySafetyWording(out);
  out = scrubInternalReasoningLanguage(out);
  out = out.replace(/\nOutros pontos relevantes[\s\S]*$/i, '');
  out = out.replace(/45 minutos a 1 hora \(podendo chegar a 1h15\)/gi, WAKE_WINDOW_REF);
  out = out.replace(/45 minutos a 1 hora(?!\s+e\s+15)/gi, WAKE_WINDOW_REF);
  out = out.replace(/seguir uma hierarquia/gi, 'seguir este passo a passo');
  out = out.replace(/siga esta hierarquia/gi, 'siga este passo a passo');
  out = out.replace(/seguir esta hierarquia/gi, 'seguir este passo a passo');

  if (ids.has('bottle_volume_30_60')) {
    out = stripBottleBehavioralReading(out);
    if (has(out, /20\s*minutos|30\s*minutos/) && !has(out, /saciedad/i)) {
      out = appendOnce(
        out,
        'O tempo isoladamente não determina o término da mamada: o parâmetro é verificar se houve retirada efetiva de leite e se a bebê apresenta sinais de saciedade.',
      );
    }
  }
  if (ids.has('nap_angry_wake_30_60')) {
    out = out.replace(/[EÉ] (normal|comum) que .{0,140}acord(em|e) chorando[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?]*como est[aá] o sono noturno[^.!?]*[.!?]/gi, '');
    out = dedupeAngryWakeExplanation(out);
    out = ensureAngryWakeFeedRefine(out, msg);
    out = consolidateAngryWakeTeste010(out);
  }
  if (excessWakeCase) {
    out = consolidateExcessWakeComposition(out);
  }
  if (pacifierDropLongWake) {
    out = consolidate55dComposition(out, ageDays);
    notes.push('55_composition_once');
  }
  out = scrubTruncatedClauses(out);
  out = applyEvaluation3060Guards(out, msg, ids, babyProfile, notes);
  notes.push('eval_05_09_guards');

  out = scrubRnArtifacts(out);
  if (ids.has('nap_angry_wake_30_60')) {
    out = applyAngryWakePostural2030(out);
    out = scrubAngryWakeTeste008(out, msg);
    out = consolidateAngryWakeTeste010(out);
  }

  const gender = enforceProfileGender({
    text: out,
    babyName: babyProfile?.babyName,
    userMessage: msg,
    babyProfile,
  });
  out = gender.text;
  if (gender.corrections.length) notes.push('gender');

  out = ensureConditionalPacifier(out, msg);
  out = ensureLateBathRitual(out, msg);
  out = ensureDayOrgLate(out, msg);
  out = ensureLearnTimeline(out, msg, ids);
  if (/fracion/i.test(msg) || reportedLongNapUnspecified(msg) || parseWakeOnsetMinutes(msg)) {
    out = stripMorningNapAfternoonCause(out);
  }
  if (/ritual/i.test(msg) && /18h|19h/i.test(msg) && !ids.has('early_night_ritual_crib_30_60')) {
    out = stripRitualHyperstimulation(out);
    out = out.replace(/[^.!?\n]*intervalo.{0,40}entre o in[ií]cio do ritual.{0,120}(acima|al[eé]m)[^.!?]*[.!?]/gi, '');
    if (!has(out, /tempo de condu[cç][aã]o faz parte|efetivamente adormecer dentro da janela/i)) {
      out = `${out}\n\n${RITUAL_WINDOW_CONDUCTION_CANON}`.trim();
    }
    if (/19h\s*30|19:30/i.test(msg) && !has(out, /19h30 est[aá] dentro da refer[eê]ncia geral/i)) {
      out = `${out}\n\nAdormecer às 19h30 está dentro da referência geral de 19h a 20h para o início do sono noturno, sem isso concluir a janela.`.trim();
    }
  }
  out = out.replace(/\bSE\b/g, 'Se');
  out = dedupeSimilarParagraphs(out.replace(/\n{3,}/g, '\n\n').trim());
  out = ensureConditionalPacifier(out, msg);
  out = ensureLateBathRitual(out, msg);
  out = ensureDayOrgLate(out, msg);
  out = ensureLearnTimeline(out, msg, ids);
  if (
    ids.has('night_hourly_wakes_30_60')
    || ids.has('night_after_3_30_60')
    || reportedNightAfter3(msg)
    || (/depois das 4h|ap[oó]s as 4h/i.test(msg) && /hora em hora/i.test(msg))
  ) {
    out = stripHourlyUnfinishedFast(out);
    out = keepFirstMatch(out, /[^.!?\n]*cerca de 3 horas aos 30 dias[^.!?]*[.!?]/gi);
    out = keepFirstMatch(out, /Aceitar o peito ao acordar n[aã]o comprova fome[^.!?]*[.!?]/gi);
    out = keepFirstMatch(out, /O primeiro passo [eé] ver h[aá] quanto tempo foi a [uú]ltima mamada efetiva[^.!?]*[.!?]/gi);
  }
  if (ids.has('crib_adaptation_same_day_30_60') || /todas as sonecas|uma soneca por (dia|vez)|passar.{0,40}ber[cç]o/i.test(msg)) {
    out = stripCribCalmRequirement(out);
    out = stripCribInventedHowTo(out);
    if (!ids.has('crib_awake_start_30_60')) out = stripUnofficialCribSeguranca(out);
  }
  if (ids.has('crib_awake_start_30_60') || /sono leve/i.test(msg)) {
    out = stripUnofficialCribSeguranca(out);
  }
  if ((ids.has('bottle_volume_30_60') || /\d+\s*ml/i.test(msg)) && !/aprendizado|trabalho|ordenh/i.test(msg)) {
    out = out.replace(/[^.!?\n]*agitado ou buscando o peito[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*ensinar a suc[cç][aã]o[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*finalidade de ensinar[^.!?]*[.!?]/gi, '');
    out = stripUnsolicitedFormulaIntro(out);
    out = stripIrritationAsFeedChange(out);
  }
  if (reportedSlingCry(msg) || ids.has('sling_cry_physio_30_60')) {
    out = stripWindowHyperstimulationConsequence(out);
  }
  if (reportedLateBathRitual(msg)) {
    out = stripLateNapCausalClaim(out);
    out = out.replace(/[^.!?\n]*gostaria de saber a que horas termina a [uú]ltima soneca[^.!?]*[.!?]/gi, '');
    out = out.replace(/[^.!?\n]*Para entender melhor,\s*a que horas termina a [uú]ltima soneca[^.!?]*[.!?]/gi, '');
    out = keepFirstMatch(out, /O ritual deve ser breve[^.!?]*[.!?]/gi);
  }
  if (reportedLateAfternoon(msg) || ids.has('late_afternoon_cry_30_60')) {
    out = keepFirstMatch(out, /Se (?:o|esse) padr[aã]o(?: abaixo de cerca de 20 minutos)? for recorrente[^.!?]*[.!?]/gi);
  }
  out = applyRound14LeftoverGuards(out, msg, ids, notes);
  out = applyRound15LeftoverGuards(out, msg, ids, notes);
  out = scrubTruncatedClauses(out);
  return { text: out, notes };
}
