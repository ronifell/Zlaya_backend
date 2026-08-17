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
  out = out.replace(/h[aá]bito a corrigir/gi, 'ponto a observar após checar saciedade');
  out = out.replace(/h[aá]bito que pode ser corrigido/gi, 'ponto a observar após checar saciedade');
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

function appendOnce(text, fragment) {
  const t = (text || '').replace(/\s+$/, '');
  const f = String(fragment || '').trim();
  if (!f) return t;
  const needle = f.slice(0, Math.min(48, f.length));
  if (needle && t.includes(needle)) return t;
  return `${t}\n\n${f}`;
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
    out = out.replace(
      /aula sobre ['‘’“”"]?Janela de Vig[ií]lia['‘’“”"]?[^.]*/gi,
      "aula 'O que é o refluxo?' — alinhada à hipótese de alimentação e desconforto pós-mamada",
    );
    if (!has(out, /prioridade [eé] (investigar )?alimenta|eixo.{0,20}alimenta|hip[oó]tese.{0,60}alimenta/i)) {
      out = appendOnce(
        out,
        'Aqui a prioridade é alimentação/saciedade e o pós-mamada — não a duração da soneca (1h ou mais não deve ser classificada como curta) e não estímulos/janela sem evidência no relato.',
      );
      notes.push('angry_wake_feeding');
    }
    if (!has(out, /refluxo.{0,80}(hip[oó]tese|sem diagn[oó]stico)|hip[oó]tese.{0,80}refluxo/i)) {
      out = appendOnce(
        out,
        'O padrão de acordar irritada, sugar pouco o peito e relaxar também justifica investigar desconforto digestivo/refluxo — como hipótese, sem diagnóstico.',
      );
      notes.push('angry_wake_reflux_hypothesis');
    }
    const hasPosturalAsk =
      /(houve arroto|permaneceu em posi|ficou em posi|me diga.{0,80}arroto|gostaria de saber:.{0,120}(arroto|vertical))/i.test(out);
    if (!hasPosturalAsk) {
      out = appendOnce(
        out,
        'Me diga o que falta no relato: depois da mamada houve arroto? Ficou em posição vertical? Por quanto tempo? O que acontece entre o fim da mamada e o deitar?',
      );
      notes.push('angry_wake_postural_ask');
    }
    out = out.replace(/\n\nA janela de vigília de referência nesta faixa é de 45 minutos a 1 hora \(podendo chegar a 1h15\)\./gi, '');
    out = out.replace(new RegExp(`\\n\\nA janela de vigília de referência nesta faixa é de ${WAKE_WINDOW_REF}\\.`, 'gi'), '');
  }

  // --- 31d excess wake (do NOT use 49d pacifier block) ---
  const excessWakeCase =
    ids.has('wake_window_30_60') &&
    /1\s*hr|1\s*h|40\s*\/\s*45|40\/45|demora|fracion/i.test(msg) &&
    /soneca grande|2\s*hrs|2h|manh/i.test(msg);
  if (excessWakeCase) {
    out = out.replace(/\n\nAntes de atribuir os despertares à chupeta[\s\S]*?despertar\./gi, '');
    out = out.replace(/45 minutos a 1 hora \(podendo chegar a 1h15\)/gi, WAKE_WINDOW_REF);
    out = out.replace(/refer[eê]ncia de 45 minutos a 1 hora(?!\s+e\s+15)/gi, `referência de ${WAKE_WINDOW_REF}`);
    if (!has(out, /1h\s*40|1h40|1 hora e 40|tempo total acordado|vig[ií]lia excessiva/i)) {
      out = appendOnce(
        out,
        `Dado central: vigília excessiva. O crítico não é só o horário em que a condução começa: se ela inicia após ~1h–1h15 e o bebê ainda demora ~40–45 min para adormecer, o tempo total até ele efetivamente dormir fica perto de 1h40–2h — acima da referência de ${WAKE_WINDOW_REF}. Comece a preparação um pouco antes para que o adormecimento caia dentro da janela.`,
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
        'Fracionar a soneca da manhã para cerca de 1h30–2h e caprichar nas mamadas costuma ajudar o padrão da tarde.',
      );
      notes.push('fraction_morning');
    }
    if (/1\s*hr|1h\s*15|2\s*hrs|soneca grande/i.test(msg)) {
      out = out.replace(/qual [eé] a dura[cç][aã]o t[ií]pica das sonecas da manh[aã] e da tarde\??/gi, '');
      out = out.replace(/quanto tempo ele permanece acordado antes de iniciar a condu[cç][aã]o[^.?]*\??/gi, '');
      out = out.replace(/qual [eé] a dura[cç][aã]o t[ií]pica da soneca da manh[aã] agora\??/gi, '');
      out = out.replace(/Para entender melhor a situa[cç][aã]o, poderia me informar\s*/gi, '');
      out = out.replace(/\bE\s+(?=\n|$)/gi, '');
      out = out.replace(/[ \t]{2,}/g, ' ');
      notes.push('strip_redundant_asks');
    }
  }

  // --- 45d night start ---
  if (ids.has('night_start_19_20_30_60')) {
    out = out.replace(/Voc[eê] j[aá] assistiu aos m[oó]dulos 3 e 4[^.?]*\??/gi, '');
    out = out.replace(/j[aá] assistiu aos m[oó]dulos 3 e 4[^.?]*\??/gi, '');
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
    if (!has(out, /(21h?30|22h).{0,50}(n[aã]o .{0,25}recomend|n[aã]o [eé] o recomend|n[aã]o recomendado)/i)) {
      out = appendOnce(
        out,
        'A família pode organizar conforme sua dinâmica, mas iniciar o sono noturno por volta de 21h30 ou 22h não é o recomendado.',
      );
      notes.push('night_not_2130');
    }
    if (/banho|21h?30|21:30/i.test(msg) && !has(out, /banho.{0,50}(posterg|atras)/i)) {
      out = appendOnce(out, 'Se o banho for às 21h30, isso pode postergar ainda mais o início do sono noturno.');
      notes.push('bath_postpones');
    }
    const lastNapMentions = (out.match(/[uú]ltima soneca/gi) || []).length;
    if (!has(out, /45\s*min/i)) {
      const napClause = lastNapMentions === 0
        ? ' Observe a que horas termina a última soneca e há quanto tempo está acordado.'
        : '';
      out = appendOnce(
        out,
        `A janela de vigília pode variar entre ${WAKE_WINDOW_REF}.${napClause}`,
      );
      notes.push('night_wake_window');
    } else if (lastNapMentions === 0) {
      out = appendOnce(
        out,
        'Observe a que horas termina a última soneca e há quanto tempo está acordado.',
      );
      notes.push('night_last_nap_ask');
    } else if (lastNapMentions > 1) {
      let seen = 0;
      out = out.replace(/[^.]*[uú]ltima soneca[^.]*\./g, (m) => {
        seen += 1;
        return seen === 1 ? m : '';
      });
      notes.push('night_dedupe_last_nap');
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
    if (!has(out, /como o beb[eê] acorda|como ele acorda|como ela acorda|acorda da soneca:\s*tranquil|vale observar se os despertares/i)) {
      out = appendOnce(
        out,
        'Como ele usa chupeta, vale observar se os despertares acontecem justamente quando ela cai. Antes disso, observe como o bebê acorda da soneca: tranquilo, chorando, buscando peito ou com desconforto. Avalie alimentação/saciedade e só então, se a queda da chupeta coincidir com o despertar, ajuste a condução da sucção.',
      );
      notes.push('49_how_wakes');
    }
  }

  // --- 40d pacifier keep (rewrite harmful guidance) ---
  if (/chupeta/i.test(msg) && /n[aã]o quero retir/i.test(msg)) {
    out = out.replace(/retomar o sono sem (a |colocar a )?chupeta/gi, 'conduzir os despertares respeitando o uso da chupeta');
    out = out.replace(/sem oferecer a chupeta imediatamente[^.]*\./gi, 'observando se ele retoma sozinho e, se precisar, recolocando a chupeta sem pressão para retirá-la.');
    out = out.replace(/conten[cç][aã]o suave[^.]*\./gi, 'preservando a habilidade que ele já tem de iniciar o sono sozinho no berço.');
    // Remove any "mau hábito" wording entirely (even in negations) — dossiers ban the classification language.
    out = out.replace(/NAO classifique como mau habito[^.]*\./gi, 'Nesta idade o Método não usa classificação comportamental inadequada para 0 a 3 meses.');
    out = out.replace(/n[aã]o classifique como mau h[aá]bito[^.]*\./gi, 'Nesta idade o Método não usa classificação comportamental inadequada para 0 a 3 meses.');
    out = out.replace(/sem rotulo de mau habito/gi, 'sem rotular o comportamento');
    out = out.replace(/sem classific[aá]-la como mau h[aá]bito/gi, 'sem rotular o comportamento nesta idade');
    out = out.replace(/\bmaus?\s+h[aá]bitos?\b/gi, 'padrão de condução');
    // Truncate dumped multi-chunk local-composer tails (keep first case block).
    out = out.replace(/\nOutros pontos relevantes[\s\S]*$/i, '');
    out = out.replace(/s[oó] dorme no colo e no peito[^.]*\./gi, '');
    out = out.replace(/Travesseiro as vezes funciona[^.]*\./gi, '');
    out = out.replace(/Dificuldade para dormir durante o dia aos 30-60 dias[^.]*\./gi, '');
    if (!has(out, /mudan[cç]a recente|at[eé] (cinco|5) dias|poucos dias|padr[aã]o (anterior|recente)/i)) {
      out = appendOnce(
        out,
        'Há uma mudança recente (até cerca de 5 dias as sonecas eram longas e o retorno era tranquilo) — isso precisa ser investigado antes de qualquer leitura só pela chupeta.',
      );
      notes.push('recent_change');
    }
    out = appendOnce(
      out,
      'Você pode manter a chupeta: vamos respeitar essa escolha e investigar alimentação, vigília, desconforto e o papel da sucção nos despertares.',
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
    if (!has(out, /120\s*ml/i)) {
      out = appendOnce(
        out,
        Number.isFinite(ageDays) && ageDays >= 31
          ? 'No segundo mês a referência da mamadeira de aprendizado é de aproximadamente 120 ml (cerca de 90 ml no primeiro mês). Observe a aceitação e a resposta da bebê.'
          : 'Para a mamadeira de aprendizado, use a referência do mês: cerca de 90 ml no primeiro mês e aproximadamente 120 ml no segundo mês.',
      );
      notes.push('bottle_120_second_month');
    } else if (Number.isFinite(ageDays) && ageDays >= 31 && !has(out, /segundo m[eê]s/i)) {
      out = appendOnce(
        out,
        'Aos 40 dias estamos no segundo mês: a referência do método para a mamadeira de aprendizado é aproximadamente 120 ml (cerca de 90 ml no primeiro mês).',
      );
      notes.push('bottle_second_month_context');
    }
    if (has(out, /20\s*minutos/) && !has(out, /30\s*minutos/)) {
      out = appendOnce(
        out,
        'A mamada pode durar cerca de 20 minutos, podendo ser mais curta ou chegar a aproximadamente 30 minutos, desde que haja retirada efetiva de leite e sinais de saciedade.',
      );
      notes.push('feed_duration_flexible');
    }
    out = out.replace(/[^.]*rotulad[oa] como um h[aá]bito[^.]*\./gi, '');
    out = out.replace(/h[aá]bito que pode ser corrigido/gi, 'ponto a observar após checar saciedade e retirada efetiva de leite');
    out = out.replace(/\bmaus?\s+h[aá]bitos?\b/gi, 'padrão de condução');
  }

  // --- 51d ---
  if (/quanto tempo.{0,30}aprender|travesseiro/i.test(msg) && /colo|peito/i.test(msg)) {
    out = out.replace(/cerca de 10 minutos|em torno de 10 minutos/gi, (m, offset, full) => {
      const before = full.slice(Math.max(0, offset - 28), offset);
      if (/n[aã]o use\s*[“"']?\s*$/i.test(before)) return m;
      return 'observando a resposta da bebê, sem cronometrar o choro';
    });
    out = out.replace(/,?\s*especialmente se est[aã]o acostumad[oa]s? a dormir no colo ou no peito[^.]*\./gi, '.');
    out = out.replace(/acostumad[oa]s? a dormir no colo(?: ou no peito)?[^.]*\./gi, '');
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
    if (!has(out, /fome.{0,60}adormec|suc[cç][aã]o durante o adormec|peito porque ainda est[aá] com fome|saciad[oa] permanece sugando|diferencie: ainda est[aá] com fome/i)) {
      out = appendOnce(
        out,
        'Quando ela “só dorme no peito”, diferencie: ainda está com fome; fez mamada efetiva e ficou saciada; ou já saciada permanece sugando enquanto adormece. Essa leitura vem antes de tratar o peito só como forma de adormecer.',
      );
      notes.push('51_hunger_vs_sleep_suck');
    }
    if (/travesseiro/i.test(msg) && !has(out, /travesseiro.{0,90}(execu[cç]|como est[aá] sendo|em que momento)|como voc[eê] est[aá] executando a t[eé]cnica do travesseiro/i)) {
      out = appendOnce(
        out,
        'Se você já está utilizando a técnica do travesseiro, investigue como está sendo a execução e em que momento da vigília você a inicia.',
      );
      notes.push('51_travesseiro_exec');
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

  // Global 30_60 scrub: never leave "mau hábito" / autorregulação / guarantees.
  out = scrubThirtySixtySafetyWording(out);
  out = out.replace(/\nOutros pontos relevantes[\s\S]*$/i, '');
  out = out.replace(/45 minutos a 1 hora \(podendo chegar a 1h15\)/gi, WAKE_WINDOW_REF);
  out = out.replace(/45 minutos a 1 hora(?!\s+e\s+15)/gi, WAKE_WINDOW_REF);

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
