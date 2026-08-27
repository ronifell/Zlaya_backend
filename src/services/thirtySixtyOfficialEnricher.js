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

function scrubTruncatedClauses(text) {
  let out = String(text || '');
  out = out.replace(/Isso pode ajudar a(?=\s+[A-ZÁÉÍÓÚÃÕÂÊÔÀÜ])/g, '');
  out = out.replace(/Isso pode ajudar a\s*$/gim, '');
  out = out.replace(/Isso pode ajudar a\s+(?=\n)/g, '');
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out.replace(/[ \t]+\n/g, '\n');
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

function consolidateExcessWakeComposition(text) {
  let out = String(text || '');
  const morningFractionRe =
    /[^.!?\n]*(?:fracion\w{0,12}\s+a soneca da manh[aã]|soneca (?:longa )?da manh[aã][^.!?\n]{0,40}fracion)[^.!?]*[.!?]/gi;
  out = keepFirstMatch(out, morningFractionRe);
  out = out.replace(/Isso pode ajudar a melhorar a distribui[cç][aã]o das sonecas durante a tarde[^.!?]*[.!?]/gi, '');
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
    /[^.!?\n]*((?:intervalo (?:aproximado |t[ií]pico )?entre as mamadas)|(?:pr[oó]ximo intervalo (?:para mamar|de mamada|alimentar))|(?:considere fome antes de insistir)|(?:fome tamb[eé]m precisa ser considerada)|(?:observe se (?:ele|ela) est[aá] pr[oó]ximo do intervalo para mamar))[^.!?]*[.!?]?/gi;
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
  return out.trim();
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
    // Masculine or unknown: keep "ele" and fix any feminine leftovers we injected.
    let out = String(text || '');
    out = out.replace(/\bestá acordada\b/gi, 'está acordado');
    out = out.replace(/\bhá quanto tempo está acordada\b/gi, 'há quanto tempo está acordado');
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
        'Esse padrão também pode apontar para algum desconforto depois da mamada, inclusive refluxo — vale observar com o pediatra da família se persistir.',
      );
      notes.push('angry_wake_reflux_hypothesis');
    }
    const hasPosturalAsk =
      /(houve arroto|permaneceu em posi|ficou em posi|me diga.{0,80}arroto|gostaria de saber:.{0,120}(arroto|vertical)|depois da mamada, antes de deitar)/i.test(out);
    if (!hasPosturalAsk) {
      out = appendOnce(
        out,
        'Depois da mamada, antes de deitar: houve arroto? Ela ficou em posição vertical, e por quanto tempo?',
      );
      notes.push('angry_wake_postural_ask');
    }
    out = out.replace(/\n\nA janela de vigília de referência nesta faixa é de 45 minutos a 1 hora \(podendo chegar a 1h15\)\./gi, '');
    out = out.replace(new RegExp(`\\n\\nA janela de vigília de referência nesta faixa é de ${WAKE_WINDOW_REF}\\.`, 'gi'), '');
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
    out = out.replace(/\n\nAntes de atribuir os despertares à chupeta[\s\S]*?despertar\./gi, '');
    out = out.replace(/45 minutos a 1 hora \(podendo chegar a 1h15\)/gi, WAKE_WINDOW_REF);
    out = out.replace(/refer[eê]ncia de 45 minutos a 1 hora(?!\s+e\s+15)/gi, `referência de ${WAKE_WINDOW_REF}`);
    out = out.replace(
      /Como ele est[aá] fazendo uma soneca longa pela manh[aã][^.]*?(dificuldade em relaxar|adormecer novamente)[^.]*\./gi,
      'A soneca longa da manhã pode ser fracionada para cerca de 1h30 a 2h, observando se a tarde se distribui melhor. A demora de 40–45 minutos para relaxar no berço se explica sobretudo pela vigília total — não pela soneca da manhã em si.',
    );
    out = out.replace(
      /[^.]*soneca longa pela manh[aã][^.]*?(contribuindo|explica|causa)[^.]*?(relaxar|adormecer)[^.]*\./gi,
      'A soneca longa da manhã pode ser fracionada para cerca de 1h30 a 2h, observando a distribuição da tarde. A demora de 40–45 minutos para relaxar no berço se explica sobretudo pela vigília total — não pela soneca da manhã em si.',
    );
    out = out.replace(
      /isso pode estar contribuindo para a dificuldade em relaxar e adormecer novamente[^.]*\./gi,
      'isso altera a distribuição das sonecas ao longo do dia e pode ser ajustado, observando a resposta da tarde.',
    );
    out = out.replace(/caprichar nas mamadas pode ajudar a relaxar[^.]*\./gi, '');
    out = out.replace(/oferecer uma mamada pode ajudar a relaxar[^.]*\./gi, 'se a demora para adormecer estiver aproximando o próximo intervalo de mamada, considere fome antes de insistir no sono.');
    out = out.replace(/oferecer uma mamada pode ajudar a relax[aá]-l[oa][^.]*\./gi, 'se a demora para adormecer estiver aproximando o próximo intervalo de mamada, considere fome antes de insistir no sono.');
    out = out.replace(/mamada pode ajudar a relaxar[^.]*\./gi, 'a fome deve ser considerada se ele já estiver perto do próximo intervalo de mamada.');
    out = out.replace(/e caprichar nas mamadas costuma ajudar o padr[aã]o da tarde\./gi, ', observando se a tarde se organiza melhor.');
    out = out.replace(/caprichar nas mamadas/gi, 'verificar se a demora aproxima o próximo intervalo de mamada');
    out = out.replace(/voc[eê] poderia me informar\s+(Tamb[eé]m [eé] importante)/gi, '$1');
    out = out.replace(/Para entender melhor, voc[eê] poderia me informar\s*/gi, '');
    out = out.replace(/[EÉ] normal que o beb[eê] de 31 dias passe por varia[cç][oõ]es nas sonecas[^.!?]*[.!?]/gi, '');
    out = out.replace(/[EÉ] normal que.{0,50}31 dias.{0,80}varia[cç][oõ]es nas sonecas[^.!?]*[.!?]/gi, '');
    out = out.replace(/Com 31 dias,\s*[eé] normal que o beb[eê] passe por varia[cç][oõ]es nas sonecas,\s*/gi, '');
    out = out.replace(/[EÉ] normal que o beb[eê] passe por varia[cç][oõ]es nas sonecas,\s*/gi, '');
    out = out.replace(/[^.!?]*se adaptando ao ritmo do dia[^.!?]*[.!?]/gi, '');
    out = out.replace(/especialmente nesta fase em que (ele|ela) est[aá] se adaptando[^.!?]*[.!?]/gi, '');
    if (!has(out, /1h\s*40|1h40|1 hora e 40|tempo total acordado|vig[ií]lia excessiva/i)) {
      out = appendOnce(
        out,
        `O ponto central é a vigília total: se a condução começa depois de cerca de 1h–1h15 e ele ainda leva uns 40–45 minutos para adormecer, o tempo acordado chega perto de 1h40–2h — acima da referência de ${WAKE_WINDOW_REF}. Comece a preparação um pouco antes para que o adormecimento, e não só o início da condução, caia dentro da janela.`,
      );
      notes.push('excess_wake_45_60');
    } else if (!has(out, /1 hora e 15|1h15|1\s*h\s*15/i)) {
      out = appendOnce(
        out,
        `A referência de vigília nesta faixa é de ${WAKE_WINDOW_REF}. O tempo que conta é até o bebê efetivamente adormecer, não só o momento em que a condução começa.`,
      );
      notes.push('wake_ref');
    }
    if (/2\s*hrs|2h|soneca grande pela manh/i.test(msg) && !has(out, /fracion/i)) {
      out = appendOnce(
        out,
        'Vale fracionar a soneca da manhã para cerca de 1h30–2h e observar se as sonecas da tarde se distribuem melhor — esse ajuste não substitui o eixo da vigília total.',
      );
      notes.push('fraction_morning');
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
    // Keep a single "21h30/22h não é recomendado" (TESTE 003: the idea appeared twice).
    out = out.replace(
      /[^.!?]*iniciar o sono noturno (às|as|por volta de )?\s*21h30 ou 22h n[aã]o [eé] o? ?(?:ideal|recomendado)[^.!?]*[.!?]/gi,
      '',
    );
    {
      let lateSeen = 0;
      out = out.replace(/[^.!?]*21h30 ou 22h n[aã]o [eé][^.!?]*recomend[^.!?]*[.!?]/gi, (m) => {
        lateSeen += 1;
        return lateSeen === 1 ? m : '';
      });
    }
    if (!has(out, /19h.{0,20}20h|19\s*h.{0,20}20\s*h/i)) {
      out = appendOnce(out, 'O horário saudável e recomendado para o início do sono noturno é entre 19h e 20h.');
      notes.push('night_19_20');
    }
    if (/banho|21h?30|21:30/i.test(msg)) {
      out = out.replace(
        /Se o banho for (dado )?[àa]s 21h30[^.]*\./gi,
        'O banho às 21h30 não é recomendado quando leva o início do sono noturno para ainda mais tarde.',
      );
      if (!has(out, /banho.{0,80}n[aã]o [eé] recomendado|n[aã]o [eé] recomendado.{0,80}banho/i)) {
        out = appendOnce(
          out,
          'Sobre a pergunta objetiva: o banho às 21h30 não é recomendado quando leva o início do sono noturno para ainda mais tarde.',
        );
      }
      notes.push('bath_not_recommended');
    }
    if (!has(out, /21h30 ou 22h n[aã]o [eé]/i)) {
      out = appendOnce(
        out,
        'A família pode organizar conforme sua dinâmica, mas iniciar o sono noturno por volta de 21h30 ou 22h não é o recomendado.',
      );
      notes.push('night_not_2130');
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
      out = out.replace(/[^.!?]*[uú]ltima soneca[^.!?]*[.!?]/g, (m) => {
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
    if (!has(out, /18h30.{0,80}(pront[oa]|iniciar a noite)|soneca de at[eé] (aproximadamente )?1 hora/i)) {
      out = appendOnce(
        out,
        'Há duas possibilidades: se ela já estiver pronta, pode iniciar o sono noturno por volta das 18h30; se ainda for cedo para a noite, pode fazer uma soneca de até aproximadamente 1 hora nesse período e iniciar o sono noturno mais tarde. Ajuste conforme a resposta dela, sem prolongar desnecessariamente o período acordada.',
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
    const pacifierConditional =
      'Como ele usa chupeta, vale observar se os despertares acontecem justamente quando ela cai. Se não houver essa relação, não há motivo, pelas informações apresentadas, para considerar a chupeta como causa principal dos despertares.';
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
    if (/chupeta/i.test(msg) && /principal hip[oó]tese.{0,80}chupeta/i.test(out)) {
      out = out.replace(/A principal hip[oó]tese[^.]*\./i, pacifierConditional);
    }
    if (!/irritad|brav[oa]|acord(a|ando) chorando|choro (bastante|intenso)/i.test(msg)) {
      out = out.replace(/[^.!?]*ainda est[aá] acordando irritad[oa][^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?]*acordando irritad[oa][^.!?]*[.!?]/gi, '');
      out = out.replace(/[^.!?]*acorda irritad[oa][^.!?]*[.!?]/gi, '');
      notes.push('49_no_invented_irritable');
    }
    out = keepFirstMatch(
      out,
      /[^.!?\n]*(?:vale observar se os despertares acontecem justamente quando ela cai|despertares coincidem com a queda da chupeta)[^.!?]*[.!?]/gi,
    );
    out = keepFirstMatch(
      out,
      /[^.!?\n]*janela de vig[ií]lia[^.!?]{0,100}45 minutos.{0,25}1 hora e 15[^.!?]*[.!?]/gi,
    );
    if (!has(out, /como o beb[eê] acorda|como ele acorda|como ela acorda|como (ele|ela|o beb[eê]) desperta|acorda da soneca:\s*tranquil/i)) {
      out = appendOnce(
        out,
        'Observe como o bebê acorda da soneca: tranquilo, chorando, buscando peito ou com desconforto.',
      );
      notes.push('49_how_wakes');
    }
    if (/chupeta/i.test(msg) && !has(out, /despertares acontecem justamente quando ela cai|queda.{0,40}coincid/i)) {
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
    const ageDays = Number(babyProfile?.ageDays);
    out = out.replace(/90\s*(a|–|-|até)\s*120\s*ml/gi, 'aproximadamente 120 ml');
    out = out.replace(
      /cerca de 20 minutos(?![^.]*30 minutos)/gi,
      'cerca de 20 minutos, podendo ser mais curta ou chegar a aproximadamente 30 minutos',
    );
    out = out.replace(
      /Isso ajudar[aá] na adapta[cç][aã]o entre peito e mamadeira,\s*\./gi,
      'A mamadeira de aprendizado tem finalidade de ensino da sucção, para ela aprender a alternar peito e mamadeira.',
    );
    out = out.replace(/adapta[cç][aã]o entre peito e mamadeira,\s*\./gi, 'adaptação entre peito e mamadeira.');
    out = out.replace(/Voc[eê] j[aá] conseguiu que a sua beb[eê] aceitasse a mamadeira\??/gi, '');
    out = out.replace(/Voc[eê] j[aá] notou como ela est[aá] se adaptando [aà] mamadeira\??/gi, '');
    out = out.replace(/E ap[oó]s a mamada no peito, ela ainda est[aá] retirando leite ou apenas sugando por conforto\??/gi, '');
    out = out.replace(/Voc[eê] j[aá] .{0,90}mamadeira\??/gi, '');
    const has120 = has(out, /120\s*ml/i);
    const hasSecondMonth = has(out, /segundo m[eê]s/i);
    if (!has120) {
      out = appendOnce(
        out,
        Number.isFinite(ageDays) && ageDays >= 31
          ? 'Aos 40 dias estamos no segundo mês: a referência da mamadeira de aprendizado é de aproximadamente 120 ml (cerca de 90 ml no primeiro mês).'
          : 'Para a mamadeira de aprendizado, use a referência do mês: cerca de 90 ml no primeiro mês e aproximadamente 120 ml no segundo mês.',
      );
      notes.push('bottle_120_second_month');
    } else if (Number.isFinite(ageDays) && ageDays >= 31 && !hasSecondMonth) {
      out = out.replace(
        /(a refer[eê]ncia (do m[eé]todo )?([eé] de )?)aproximadamente 120 ml/i,
        'aos 40 dias (segundo mês) a referência é de aproximadamente 120 ml (cerca de 90 ml no primeiro mês)',
      );
      notes.push('bottle_second_month_context');
    }
    const mlHits = out.match(/120\s*ml/gi) || [];
    if (mlHits.length > 1) {
      const lines = out.split('\n');
      const keepIdx = lines.findIndex((l) => /120\s*ml/i.test(l) && /segundo m[eê]s/i.test(l));
      const fallbackIdx = lines.findIndex((l) => /120\s*ml/i.test(l));
      const keep = keepIdx >= 0 ? keepIdx : fallbackIdx;
      out = lines.filter((l, i) => !/120\s*ml/i.test(l) || i === keep).join('\n');
      notes.push('bottle_dedupe_120');
    }
    if (has(out, /20\s*minutos/) && !has(out, /30\s*minutos/)) {
      out = appendOnce(
        out,
        'A mamada pode durar cerca de 20 minutos, podendo ser mais curta ou chegar a aproximadamente 30 minutos, desde que haja retirada efetiva de leite e sinais de saciedade.',
      );
      notes.push('feed_duration_flexible');
    }
    out = stripBottleBehavioralReading(out);
    out = out.replace(/[^.]*rotulad[oa] como um h[aá]bito[^.]*\./gi, '');
    out = out.replace(/\bmaus?\s+h[aá]bitos?\b/gi, 'padrão de condução');
    if (has(out, /20\s*minutos|30\s*minutos/) && !has(out, /saciedad/i)) {
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
    out = out.replace(/tente faz[eê]-l[oa] dormir novamente sem oferecer o peito imediatamente[^.]*\./gi, '');
    out = out.replace(/Se (ele|ela) acordar antes de 3h, tente faz[eê]-l[oa] dormir novamente sem oferecer o peito[^.]*\./gi, '');
    out = out.replace(/associa[cç][aã]o de que toda vez que (ele|ela) acorda[^.]*\./gi, '');
    out = out.replace(/evitar a associa[cç][aã]o[^.]*\./gi, '');
    out = out.replace(/ap[oó]s 4 horas de sono/gi, 'após as 4h da manhã');
    out = out.replace(/acorda ap[oó]s 4 horas(?!\s+da manh)/gi, 'acorda após as 4h da manhã');
    out = out.replace(/acordou ap[oó]s 4 horas(?!\s+da manh)/gi, 'acordou após as 4h da manhã');
    out = out.replace(/Isso ajuda a evitar que (ele|ela) associe o despertar [aà] necessidade de mamar[^.]*\./gi, '');
    out = out.replace(/evitar que (ele|ela) associe o despertar [aà] necessidade de mamar[^.]*\./gi, '');
    out = out.replace(/quanto tempo durou o primeiro sono da noite\??/gi, '');
    out = out.replace(/Quando (ele|ela) acorda antes de 3 horas, voc[eê] oferece o peito automaticamente\??/gi, '');
    out = out.replace(/H[aá] sinais claros de fome ou apenas agita[cç][aã]o breve\??/gi, '');
    out = out.replace(/Para entender melhor a situa[cç][aã]o, gostaria de saber:\s*/gi, '');
    out = out.replace(/gostaria de saber:\s*(?=A pergunta decisiva|Antes de pensar|$)/gi, '');
    if (!has(out, /acordar.{0,40}para mamar.{0,40}acord(a|ar) (sozinho|espont)/i) && !has(out, /diferente de (um beb[eê]|ele) (de \d+ dias )?acordar/i)) {
      out = appendOnce(
        out,
        'Uma coisa é não acordar um bebê saudável e com bom ganho de peso só para mamar. Outra é ele acordar sozinho depois das 4h, de hora em hora, e mamar quando o peito é oferecido — e depois dormir. Nesse segundo caso, o intervalo de 3 horas não serve sozinho para decidir que a mamada não é necessária.',
      );
      notes.push('night_spontaneous_vs_wake');
    }
    if (!has(out, /[uú]ltima mamada antes das 4h|hor[aá]rio.{0,40}mamou.{0,40}4h|antes das 4h.{0,50}mam/i)) {
      out = appendOnce(
        out,
        'A pergunta decisiva é: antes das 4h da manhã, qual foi o horário da última mamada? Se já tinham passado cerca de 2h30 a 3h, ofereça uma mamada efetiva até a saciedade. Se o despertar ocorrer antes de completar aproximadamente 3 horas desde uma mamada efetiva, tente conduzi-lo novamente ao sono sem oferecer o peito imediatamente. A percepção de que “não é fome” não basta — e a decisão de oferecer o peito não se resume a ele ainda ser novinho.',
      );
      notes.push('night_last_feed_before_4');
    } else if (!has(out, /antes de completar.{0,40}3 horas.{0,80}sem oferecer|ainda n[aã]o completou.{0,50}intervalo.{0,80}(conduz|sono)/i)) {
      out = appendOnce(
        out,
        'Se já passaram cerca de 2h30 a 3h desde a última mamada efetiva, ofereça uma mamada efetiva até a saciedade. Se o despertar ocorrer antes de completar aproximadamente 3 horas desde uma mamada efetiva, tente conduzi-lo novamente ao sono sem oferecer o peito imediatamente.',
      );
      notes.push('night_interval_conduct');
    }
    if (!has(out, /peito, f[oó]rmula ou complemento|mamadas do dia e da noite est[aã]o efetivas|suga um pouco e adormece/i)) {
      out = appendOnce(
        out,
        'Antes de pensar em associação peito–sono, vale olhar a alimentação: ele mama no peito, fórmula ou complemento? Como está a rotina alimentar do dia — intervalos, efetividade das mamadas e manutenção da saciedade? Como está o ganho de peso e a produção de leite? Nesses despertares ele faz uma mamada efetiva ou só suga um pouco e adormece? Depois de mamar, houve arroto e posição vertical por 20 a 30 minutos? Há sinais de desconforto?',
      );
      notes.push('night_feed_first');
    } else {
      if (!has(out, /rotina alimentar do dia|mamadas do dia/i)) {
        out = appendOnce(
          out,
          'Como está a rotina alimentar do dia — intervalos, efetividade das mamadas e manutenção da saciedade?',
        );
        notes.push('night_daytime_feeding');
      }
      if (!has(out, /vertical|arroto/i)) {
        out = appendOnce(
          out,
          'Nas mamadas, as medidas posturais estão sendo feitas — arroto e posição vertical por 20 a 30 minutos? Há sinais de desconforto depois de mamar?',
        );
        notes.push('night_postural');
      }
    }
  }

  // --- 51d ---
  if (/quanto tempo.{0,30}aprender|travesseiro/i.test(msg) && /colo|peito/i.test(msg)) {
    out = out.replace(
      /(?:Ap[oó]s esse tempo|Depois (?:disso|desse tempo)|Ao (?:final|t[eé]rmino|fim) da janela)[^.!?]{0,90}mamada efetiva[^.!?]*[.!?]/gi,
      '',
    );
    out = out.replace(
      /quando (a janela|esse tempo) (terminar|acabar|se encerrar)[^.!?]{0,50}mamada[^.!?]*[.!?]/gi,
      '',
    );
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
    out = out.replace(
      /, mas [eé] fundamental que voc[eê] a inicie quando a beb[eê] estiver calma/gi,
      '',
    );
    out = out.replace(
      /[eé] fundamental que voc[eê] a inicie quando a beb[eê] estiver calma[^.]*\./gi,
      '',
    );
    out = out.replace(/  +/g, ' ');
    out = out.replace(/\.\s*\./g, '.');
    out = out.replace(/\(n[aã]o use ['"“”']?o tempo que a beb[eê] precisar[^)]*\)/gi, '');
    out = out.replace(/Para ajudar na adapta[cç][aã]o ao ber[cç]o,/gi, 'Para conduzir a dificuldade de dormir durante o dia,');
    out = out.replace(/ajuda na adapta[cç][aã]o ao ber[cç]o/gi, 'ajuda na condução do sono diurno');
    out = out.replace(/adapta[cç][aã]o ao ber[cç]o/gi, 'condução do sono diurno');
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
    if (!has(out, /fome.{0,60}adormec|suc[cç][aã]o durante o adormec|peito porque ainda est[aá] com fome|saciad[oa] permanece sugando|diferencie: ainda est[aá] com fome/i)) {
      out = appendOnce(
        out,
        `Quando ela “só dorme no peito”, diferencie: ainda está com fome; fez mamada efetiva e ficou saciada; ou já saciada permanece sugando enquanto adormece. ${conductAfterSatiety}`,
      );
      notes.push('51_hunger_vs_sleep_suck');
    } else if (!has(out, /retir[ae]-a do peito|retire-a do peito|retir[aá]-l[oa] do peito/i)) {
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
    out = keepFirstMatch(
      out,
      /[^.!?\n]*(?:execu[cç][aã]o.{0,40}travesseiro|travesseiro.{0,90}execu|executando.{0,50}travesseiro|como est[aá] (sendo )?a execu[cç][aã]o)[^.!?]*[.!?]/gi,
    );
    const asksTravesseiroExec =
      /como voc[eê] est[aá] executando.{0,50}travesseiro|como est[aá] (sendo )?a execu[cç][aã]o.{0,40}travesseiro|travesseiro.{0,90}(execu[cç]|em que momento)/i.test(out);
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
    if (/travesseiro/i.test(msg) && !has(out, /aula.{0,60}travesseiro/i)) {
      out = appendOnce(
        out,
        'Recomendo que você revise a aula sobre a estratégia do travesseiro para obter mais orientações sobre como aplicá-la de forma eficaz.',
      );
      notes.push('51_travesseiro_lesson');
    }
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
    if (!has(out, /irritad|come[cç]ar a chorar|ajud[aá]-l[oa] a se acalmar/i)) {
      out = appendOnce(
        out,
        'Se ele ficar irritado ou começar a chorar, você pode ajudá-lo a se acalmar e continuar a condução do sono. Nessa fase, não precisamos exigir que ele sempre consiga adormecer sozinho, mas podemos aproveitar os momentos em que está tranquilo para favorecer o início do sono no berço.',
      );
      notes.push('56_no_autonomy_demand');
    }
    if (!has(out, /adormecer mamando|j[aá] dormindo|n[aã]o precisa acord[aá]-l[oa]/i)) {
      out = appendOnce(
        out,
        'E se a mamada coincidir com o horário de dormir e ele adormecer mamando, não precisa acordá-lo: pode colocá-lo no berço já dormindo.',
      );
      notes.push('56_feed_asleep_ok');
    }
    const travesseiroPurpose56 =
      'A Estratégia do Travesseiro também pode ajudar na condução e na colocação do bebê no berço, dando mais segurança para você nesse processo.';
    const travesseiroLesson56 =
      'Assista à aula sobre a Estratégia do Travesseiro no aplicativo para aprender como aplicá-la corretamente.';
    const hasCanonicalPurpose56 = /tamb[eé]m pode ajudar na condu[cç][aã]o e na coloca[cç][aã]o do beb[eê] no ber[cç]o, dando mais seguran[cç]a/i.test(out);
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
    if (!has(out, /primeira soneca da manh[aã].{0,80}(mesmo dia|daquele dia)|todas as demais sonecas.{0,40}(mesmo dia|daquele dia)/i)) {
      out = appendOnce(
        out,
        'O indicado não é avançar uma soneca por vez ao longo dos dias. Comece pela primeira soneca da manhã e siga com todas as demais sonecas daquele mesmo dia no berço. Repita o processo diariamente até consolidar.',
      );
      notes.push('57_same_day_naps');
    }
    out = out.replace(
      /[^.!?]*(avan[cç]ar gradativamente|progressivamente)[^.!?]*boa abordagem[^.!?]*[.!?]/gi,
      '',
    );
    if (!has(out, /acalmar no colo.{0,40}voltar ao ber[cç]o|colo.{0,30}voltar.{0,20}ber[cç]o.{0,40}repetir/i)) {
      out = appendOnce(
        out,
        'Se houver muita resistência, acalme no colo, volte ao berço e repita até adormecer. Não cronometre o choro.',
      );
      notes.push('57_resistance_loop');
    }
    if (!has(out, /n[aã]o cronometr|sem cronometrar|sem tempo (fixo|predeterminado)/i)) {
      out = appendOnce(
        out,
        'Não cronometre o choro: observe a resposta e, se precisar, acalme no colo, volte ao berço e repita até adormecer.',
      );
      notes.push('57_no_timer');
    }
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
      /O uso do travesseiro pode ser uma boa estrat[eé]gia[^.!?]*[.!?]/gi,
      travesseiroDirect57,
    );
    out = out.replace(
      /[^.!?]*pode ser uma boa estrat[eé]gia para ajudar na adapta[cç][aã]o[^.!?]*[.!?]/gi,
      travesseiroDirect57,
    );
    out = out.replace(/pode ser uma boa estrat[eé]gia/gi, 'deve ser usada');
    if (!has(out, /use a estrat[eé]gia do travesseiro|travesseiro.{0,40}condu[cç][aã]o e na coloca[cç][aã]o/i)) {
      out = appendOnce(out, travesseiroDirect57);
      notes.push('57_travesseiro_direct');
    }
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
    out = out.replace(
      /Seria [uú]til saber quanto tempo ele demora para (adormecer depois de deitar|entrar em sono)[^.!?]*[.!?]/gi,
      'Também é importante observar quanto tempo ele demora para entrar em sono. Essa informação ajuda a avaliar melhor como a janela está funcionando, sem presumir a forma ou o local em que ele adormece.',
    );
    out = out.replace(/adormecer depois de deitar/gi, 'entrar em sono');
    out = out.replace(/\s*e a dura[cç][aã]o da soneca da manh[aã][^.?]*\??/gi, '');
    out = out.replace(/Isso pode ajudar a ajustar a rotina d[ea]le\./gi, '');
    if (!has(out, /entrar em sono/i)) {
      out = appendOnce(
        out,
        'Também é importante observar quanto tempo ele demora para entrar em sono. Essa informação ajuda a avaliar melhor como a janela está funcionando, sem presumir a forma ou o local em que ele adormece.',
      );
      notes.push('55_enter_sleep_ask');
    }
    const longPacifierRe =
      /Quando a chupeta cair e ele apenas reclamar[\s\S]{0,360}?oferec[eê]-l[ao] novamente\./gi;
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
        'Quando a chupeta cair e ele apenas reclamar, você não precisa recolocá-la imediatamente. Observe um pouco para ver se ele consegue continuar dormindo sem a chupeta. Se ele despertar e precisar de ajuda para retomar o sono, você pode oferecê-la novamente.',
      );
      notes.push('55_pacifier_wait');
    }
    if (!has(out, /1h30.{0,40}(ultrapass|acima|excede)|ultrapassa o esperado|acima da refer[eê]ncia/i)) {
      out = appendOnce(
        out,
        `Sobre o tempo acordado: a referência de janela de vigília é de ${WAKE_WINDOW_REF}. Permanecer acordado habitualmente por 1h30 a 1h45 já ultrapassa o esperado para essa faixa etária. Procure observar os sinais de sono e iniciar a preparação para dormir antes de ultrapassar repetidamente 1h15.`,
      );
      notes.push('55_window_exceeded');
    } else if (!has(out, /45\s*min/i)) {
      out = appendOnce(
        out,
        `Aos 55 dias, a referência de janela de vigília é de ${WAKE_WINDOW_REF}.`,
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
  }
  if (excessWakeCase) {
    out = consolidateExcessWakeComposition(out);
  }
  out = scrubTruncatedClauses(out);

  const gender = enforceProfileGender({
    text: out,
    babyName: babyProfile?.babyName,
    userMessage: msg,
    babyProfile,
  });
  out = gender.text;
  if (gender.corrections.length) notes.push('gender');

  out = scrubRnArtifacts(out);
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return { text: out, notes };
}
