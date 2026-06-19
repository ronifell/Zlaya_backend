import { processTurn } from '../services/zlayaPipeline.js';

/**
 * Re-runs the EXACT mother messages from the test feedback batches so we can
 * verify, end-to-end, that every failure mode flagged by the developer has
 * been addressed by the new pipeline:
 *
 *   • Age fidelity (10d, 22d cases)             — checkAgeConsistency guard
 *   • "fome residual acumulada" wording (16d)   — signal + chunk + prompt rewrite
 *   • RN + chupeta misclassified as associação
 *     comportamental (22d)                      — applyRnIntentOverrides
 *   • "manter chupeta presa" guidance (22d)     — forbidden term + regex guard
 *   • Mama bem aceita como suficiente (23d)     — PROVIDED_FACTS narrowed +
 *                                                 mama_bem_with_concurrent_symptoms
 *   • Falta orientar 30–40 min vertical         — chunk + rule + signal priority
 *   • Late crib placement sem investigar
 *     alimentação (22d)                         — late_crib_placement upgraded
 */

const CASES = [
  {
    id: 'caso-16d',
    label: 'Caso 16 dias — fim de tarde + madrugada + complemento/icterícia/linguinha',
    profile: { motherName: 'Sofia', babyName: 'Liz', ageDays: 16 },
    message:
      'Minha bebê tem 16 dias, teve icterícia e fez o procedimento da linguinha, usa sonda e recebe complemento. No finalzinho da tarde ela começa a procurar o peito a cada 1 hora e piora muito na madrugada, mas de manhã fica mais tranquila. O que pode ser?',
    checks: {
      mustContainAny: ['baixa transferência', 'menor produção', 'baixa produção'],
      mustNotContain: [
        'fome residual acumulada',
        'associação negativa',
        'fazendo manha',
        'mamadas agrupadas',
        'mamada agrupada',
        'cluster feeding',
        'cluster',
        'autorregulação',
      ],
      ageMustStayAt: 16,
    },
  },
  {
    id: 'caso-10d',
    label: 'Caso 10 dias — soneca de 3h + nervoso entre 23h–02h, devo diminuir a soneca?',
    profile: { motherName: 'Marina', babyName: 'Bento', ageDays: 10 },
    message:
      'Meu bebê de 10 dias faz sonecas de até 3 horas durante o dia, mas entre 23h e 02h fica muito nervoso, suga as mãozinhas e choraminga. Devo diminuir as sonecas de 3 horas?',
    checks: {
      mustContainAny: ['acordar', 'mamada', 'mamadas efetivas', 'mamada efetiva'],
      mustNotContain: ['14 dias', '15 dias', '12 dias', '7 dias'],
      ageMustStayAt: 10,
    },
  },
  {
    id: 'caso-23d',
    label: 'Caso 23 dias — "mama bem" + sonecas curtas + acorda ao deitar (duas camadas)',
    profile: { motherName: 'Joana', babyName: 'Vitor', ageDays: 23 },
    message:
      'Meu bebê de 23 dias mama bem nos dois seios, mas as sonecas diurnas são muito difíceis. Ele só dorme no colo e acorda assim que coloco no berço. Faço arrotar.',
    checks: {
      mustContainAny: ['30', 'vertical', 'mamada efetiva', 'produção'],
      mustNotContain: ['fome residual acumulada', 'associação negativa', 'dependência'],
      ageMustStayAt: 23,
    },
  },
  {
    id: 'caso-22d-chupeta',
    label: 'Caso 22 dias — chupeta cai + só vai pro berço depois da 1h da manhã',
    profile: { motherName: 'Iara', babyName: 'Caio', ageDays: 22 },
    message:
      'Meu bebê de 22 dias só dorme com a chupeta e acorda toda hora que ela cai. Às vezes só consigo colocá-lo no berço depois da 1h da manhã. Isso é normal pra idade? Como posso melhorar?',
    checks: {
      intentMustNotBe: ['associacao_comportamental'],
      mustNotContain: [
        'manter a chupeta presa',
        'manter a chupeta segura',
        'manter a chupeta fixa',
        'chupeta com design',
        'associação negativa',
        'dependência',
      ],
      mustContainAny: ['vertical', 'mamada', 'produção', 'transferência'],
      ageMustStayAt: 22,
    },
  },
  {
    id: 'caso-12d-noturno',
    label: 'Caso 12 dias — dormiu de 19h e acordou às 23h (intervalo noturno não é rígido, mas investigar fome)',
    profile: { motherName: 'Luiza', babyName: 'Aurora', ageDays: 12 },
    message:
      'Minha bebê tem 12 dias e pegou no sono por volta de 19h. Acordou agora, perto das 23h. O que devo fazer?',
    checks: {
      // She must NOT be told to wake-every-3h-rigidly at night, NOR to "hold"/wait;
      // she MUST be told the sequence (offer feeding → observe hunger → feed → vertical → transfer)
      // and the AI must ask if she offered the feeding and if the baby showed hunger signs.
      mustContainAny: ['oferec', 'sinais de fome', 'sucção ativa', 'sucçao ativa'],
      mustNotContain: [
        'segurar a mamada',
        'aguardar a próxima janela',
        'aguardar o próximo horário',
        'não ofereça',
        'a cada 2h-2h30',
        'a cada 2h a 2h30',
        'a cada 3 horas',
      ],
      ageMustStayAt: 12,
    },
  },
  {
    id: 'caso-hayato-style',
    label: 'Caso 20d — vespertine + busca constante + late crib (estilo Hayato)',
    profile: { motherName: 'Helena', babyName: 'Davi', ageDays: 20 },
    message:
      'Meu bebê de 20 dias fica bem durante o dia, mas depois das 18h piora muito, só se acalma no peito e preciso voltar a dar o peito o tempo todo. Ele mama nos dois seios, eu faço arrotar e mantenho acordado, mas só consigo colocar no berço depois da 1h da manhã.',
    checks: {
      mustContainAny: ['baixa transferência', 'menor produção', 'baixa produção'],
      mustNotContain: [
        'fome residual acumulada',
        'associação negativa',
        'fazendo manha',
        'mamadas agrupadas',
        'mamada agrupada',
        'cluster feeding',
        'cluster',
        'autorregulação',
      ],
      ageMustStayAt: 20,
    },
  },
  {
    id: 'teste-001-rn-9d',
    label: 'TESTE 001 (16/06/2026) — RN 9 dias: vespertine + medo de associação negativa + "isso é normal?"',
    profile: { motherName: 'Bia', babyName: 'Heitor', ageDays: 9 },
    message:
      'Bebê de 9 dias. Durante o dia faz sonecas geralmente de 2 a 2,5h sem dificuldades. Acorda chorando, mama um pouco, me esforço para mantê-lo acordado por uma meia hora, ele mama o outro peito, coloco para arrotar e vai para o berço (em todo o processo está muito sonolento). Depois das 18h mais ou menos, fica mais tempo acordado e já não deixa colocar para arrotar tão facilmente. Assim que coloco no berço desperta e começa a chorar. Em geral eu tento muitas coisas, mas, por fim, ele só se acalma se voltar para o peito. Tenho medo dessa associação negativa, mas muitas vezes nada mais funciona. Eu só queria que ele dormisse à noite como dorme de dia. Às vezes só consigo colocá-lo no berço depois de 1 da manhã. Isso é normal para a idade? Como posso melhorar?',
    checks: {
      // Methodological framework + direct answer to normality + concrete satiety
      // (the three improvements identified in the official 9.3/10 dossier).
      mustContainAny: ['baixa transferência', 'menor produção', 'baixa produção'],
      // The response must address the normality question directly somewhere
      // (not only with empathy). We accept several phrasings.
      mustContainOneOf: [
        ['sim, esse padrão', 'sim, esse comportamento', 'sim, é comum', 'sim, é esperado', 'em parte sim', 'pode ocorrer em rn', 'é comum no rn', 'é esperado no rn', 'é frequente no rn'],
        // Satiety signs concretely listed (accept both conjugated and
        // infinitive forms — the LLM often switches between "ele solta o
        // peito" and "ele deve soltar o peito").
        ['solta o peito', 'soltar o peito', 'abre as mãozinhas', 'abrir as mãozinhas', 'abre as maozinhas', 'abrir as maozinhas'],
        // The 30-40 min vertical position
        ['30 a 40 minutos', '30 a 40 min', 'posição vertical'],
        // Reassurance about negative association
        ['associação negativa', 'não configura associação', 'fisiológic'],
      ],
      mustNotContain: [
        'fome residual acumulada',
        'mamadas agrupadas',
        'mamada agrupada',
        'cluster feeding',
        'cluster',
        'autorregulação',
        'fazendo manha',
      ],
      ageMustStayAt: 9,
    },
  },
  {
    id: 'teste-004-rn-6d-crib-day-night',
    label: 'TESTE 004 (RN 6d) — bebê faz sonecas no berço de DIA mas não fica no berço à NOITE; intent NÃO pode ser adaptacao_ao_berco',
    profile: { motherName: 'Sara', babyName: 'Bento', ageDays: 6 },
    message:
      'Bebê 6 dias, estabelecendo uma rotina. Faz todas as sonecas no berço, mas a noite não quer ficar no berço. Estou tendo que pega-lo e leva-lo para o meu quarto. o que pode ser?',
    checks: {
      // Internal classification must NOT be `adaptacao_ao_berco` for this
      // pattern — Hayato/dossier feedback explicitly asked for the override.
      intentMustNotBe: ['adaptacao_ao_berco'],
      // The response must name the night-feeding hypothesis directly
      // (and NOT lead with crib adaptation / lessons about "day-night swap"
      // or "starting nighttime sleep").
      mustContainAny: [
        'mamada noturna',
        'producao de leite',
        'produção de leite',
        'baixa produção',
        'baixa producao',
        'menor produção',
        'menor producao',
        'menor transferência',
        'menor transferencia',
      ],
      mustNotContain: [
        'fome residual acumulada',
        'mamadas agrupadas',
        'mamada agrupada',
        'cluster feeding',
        'cluster',
        'autorregulação',
        'fazendo manha',
        'a produção de leite da mãe diminui após as 18h',
        'a produção diminui após as 18h',
        'a produção cai após as 18h',
      ],
      ageMustStayAt: 6,
    },
  },
  {
    id: 'teste-004-rn-12d-diaper-before-feed',
    label: 'TESTE 004 (RN 12d/02 — Hayato) — orientação de troca de fralda ANTES da mamada na madrugada',
    profile: { motherName: 'Aline', babyName: 'Théo', ageDays: 12 },
    message:
      'Meu bebe esta noite acordou para mamar 4:40. Troquei a fralda de xixi pois estava muito cheia. Terminou de mamar era 5:20. Mas demorou para engrenar no sono novamente. Era quase 6:50 da manha quando ele realmente dormiu. Neste caso, seria interessante ter "começado o dia" com ele, abrindo janela, trocando o pijaminha e tentado colocar pra dormir de nvo, ou, manter ele ali no quarto - como fiz - para que ele dormisse? Sempre respeito a janela de sono, mas ele não estava dormindo de jeito nenhum. Ambiente estava adequado, escuro, ruido, fralda trocada, mama. Minha questão é: o dia dele nao vai inicar muito tarde? Provavelmente ele irá acordar umas 8:30 (maximo), pois irei acorda-lo prs mamar.',
    checks: {
      // Must validate keeping the night ambient + must include the
      // diaper-before-feed orientation that Hayato flagged as missing
      // from the base, plus the 30-40 min vertical position. The
      // "before-or-after" question is only mandatory when the mother
      // hasn't already provided the info — in this exact message she
      // already said she changed BEFORE feeding, so we don't require it.
      mustContainAny: ['fez certo', 'manter o ambiente noturno'],
      mustContainOneOf: [
        // the diaper-before-feed orientation
        ['antes da mamada', 'antes de mamar', 'inverter a sequencia', 'inverter a sequência', 'trocar a fralda antes', 'troca da fralda antes'],
        // 30-40 min vertical
        ['30 a 40 minutos', '30 a 40 min'],
      ],
      mustNotContain: [
        'fome residual acumulada',
        'mamadas agrupadas',
        'cluster feeding',
        'cluster',
        'ajudar o bebê a se adaptar melhor ao sono',
        'treinamento de sono',
      ],
      ageMustStayAt: 12,
    },
  },
  {
    id: 'caso-vespertine-vocab-fidelity',
    label: 'Caso 18d — padrão vespertino direto: vocabulário 100% do método (proíbe "cluster"/"mamadas agrupadas")',
    profile: { motherName: 'Clara', babyName: 'Noah', ageDays: 18 },
    message:
      'Meu bebê de 18 dias começa a ficar muito agitado depois das 18h, busca o peito o tempo todo e só se acalma mamando. Tenho medo de estar criando associação negativa. O que faço?',
    checks: {
      // Must speak the method vocabulary and explicitly reassure about
      // associação negativa; must NOT import the external "cluster" concept.
      mustContainAny: ['baixa transferência', 'menor produção', 'baixa produção', 'necessidade de sucção', 'mamada efetiva'],
      mustNotContain: [
        'mamadas agrupadas',
        'mamada agrupada',
        'cluster feeding',
        'cluster',
        'autorregulação',
        'fome residual acumulada',
        'fazendo manha',
      ],
      ageMustStayAt: 18,
    },
  },
];

function stripDiacritics(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Negation cues that, when present in the ~60 chars BEFORE a forbidden term,
// turn that occurrence into a methodologically-correct teaching ("isso NÃO é
// associação negativa") rather than a leak. Mirrors the logic used in
// runCriticalScenarios.js so the simulator doesn't false-positive on
// chunk-aligned negation phrasing.
const NEGATION_CUES = [
  'nao ', 'não ', 'sem ', 'evitar', 'evite', 'longe de', 'jamais', 'nunca',
  'em vez de', 'ao invés de', 'ao inves de', 'diferente de', 'oposto de',
  'nao deve', 'não deve', 'nao pode', 'não pode',
  'nao significa', 'não significa', 'nao e ', 'não é ',
  'nao se trata', 'não se trata',
];

function termLeakedAffirmatively(text, term) {
  const haystack = stripDiacritics(text);
  const needle = stripDiacritics(term);
  if (!needle) return false;
  let pos = 0;
  while (true) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) return false;
    const windowStart = Math.max(0, idx - 60);
    const before = haystack.slice(windowStart, idx);
    const negated = NEGATION_CUES.some((cue) => before.includes(stripDiacritics(cue)));
    if (!negated) return true;
    pos = idx + needle.length;
  }
}

function checkCase(c, result) {
  const issues = [];
  const text = String(result.response?.text || '');
  const norm = stripDiacritics(text);

  if (c.checks.intentMustNotBe?.length) {
    const got = result.intent?.intent;
    if (got && c.checks.intentMustNotBe.includes(got)) {
      issues.push(`intent '${got}' is forbidden for this case`);
    }
  }
  if (c.checks.mustContainAny?.length) {
    const hit = c.checks.mustContainAny.some((s) => norm.includes(stripDiacritics(s)));
    if (!hit) {
      issues.push(
        `none of the required substrings appeared: [${c.checks.mustContainAny.join(' | ')}]`,
      );
    }
  }
  // mustContainOneOf: list of buckets — each bucket is an array of substrings;
  // at least one substring per bucket must be present in the response. Lets
  // us express "must address normality AND list satiety signs AND mention
  // vertical position AND reassure about negative association".
  if (Array.isArray(c.checks.mustContainOneOf)) {
    for (const bucket of c.checks.mustContainOneOf) {
      if (!Array.isArray(bucket) || bucket.length === 0) continue;
      const hit = bucket.some((s) => norm.includes(stripDiacritics(s)));
      if (!hit) {
        issues.push(
          `no member of required bucket appeared: [${bucket.join(' | ')}]`,
        );
      }
    }
  }
  if (c.checks.mustNotContain?.length) {
    for (const s of c.checks.mustNotContain) {
      if (termLeakedAffirmatively(text, s)) {
        issues.push(`forbidden substring used affirmatively: "${s}"`);
      }
    }
  }
  if (Number.isFinite(c.checks.ageMustStayAt)) {
    const re = /(\d{1,3})(?:\s*(?:a|ate|–|-|—)\s*(\d{1,3}))?\s*dias?\b/gi;
    let m;
    while ((m = re.exec(norm)) !== null) {
      const a = Number(m[1]);
      const b = m[2] ? Number(m[2]) : a;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      if (lo > 60) continue;
      if (c.checks.ageMustStayAt < lo || c.checks.ageMustStayAt > hi) {
        issues.push(
          `age hallucinated: response said "${m[0].trim()}" but profile is ${c.checks.ageMustStayAt} dias`,
        );
      }
    }
  }
  return issues;
}

function fmtSignals(signals) {
  if (!signals?.length) return '—';
  return signals.map((s) => s.id).join(', ');
}

async function main() {
  let pass = 0;
  let fail = 0;

  for (const c of CASES) {
    const started = Date.now();
    const result = await processTurn({
      message: c.message,
      babyProfile: c.profile,
      conversation: [],
      conversationId: 'feedback-simulation',
    });
    const ms = Date.now() - started;
    const issues = checkCase(c, result);
    const ok = issues.length === 0;
    if (ok) pass++;
    else fail++;

    const intentInfo = result.intent
      ? `${result.intent.intent} (conf=${(result.intent.confidence ?? 0).toFixed(2)}${
          result.intent.originalIntent
            ? `, override de '${result.intent.originalIntent}'`
            : ''
        })`
      : '—';

    // The pipeline doesn't surface the signals object in the public response;
    // we re-run a lightweight extraction here to display them.
    const { extractSignals } = await import('../services/signalExtractor.js');
    const sig = extractSignals({ message: c.message, conversation: [] });

    console.log('\n=============================================================');
    console.log(c.label);
    console.log('-------------------------------------------------------------');
    console.log(`profile        : ${JSON.stringify(c.profile)}`);
    console.log(`mensagem (mãe) : ${c.message}`);
    console.log('-------------------------------------------------------------');
    console.log(`ageBand        : ${result.ageBand?.id} (${result.ageDays} dias)`);
    console.log(`intent         : ${intentInfo}`);
    console.log(`signals        : ${fmtSignals(sig.signals)}`);
    console.log(`route          : ${result.route}`);
    console.log(`retrieval      : conf=${result.retrieval?.confidence?.toFixed(2)} topSim=${result.retrieval?.topSimilarity?.toFixed(2)} chunks=${result.retrieval?.chunks?.length}`);
    console.log(`safety         : safe=${result.safety?.safe} violations=${(result.safety?.violations || []).length}`);
    if ((result.safety?.violations || []).length) {
      for (const v of result.safety.violations) {
        console.log(`                 ✗ ${v.kind}: ${v.term}`);
      }
    }
    console.log(`duration       : ${ms}ms`);
    console.log('-------------------------------------------------------------');
    console.log('RESPOSTA DA ZLAYA:');
    console.log(result.response?.text);
    console.log('-------------------------------------------------------------');
    if (ok) {
      console.log(`STATUS: ✅ PASS`);
    } else {
      console.log(`STATUS: ❌ FAIL`);
      for (const i of issues) console.log(`        ✗ ${i}`);
    }
  }

  console.log('\n=============================================================');
  console.log(`SUMMARY: ${pass} passed, ${fail} failed (of ${CASES.length})`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[simulation] failed:', err);
  process.exit(1);
});
