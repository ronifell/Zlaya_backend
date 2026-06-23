#!/usr/bin/env node
/**
 * Simulation — Official dossier 22/06/2026 (TESTE 006)
 *   TESTE 006  RN  6d  (berço ok de dia + problema só à noite — pergunta forma de alimentação NO INÍCIO,
 *                       hierarquia oficial mamada noturna → baixa produção → saciedade → peito/fórmula/complemento
 *                       → vertical 30 a 40 min → arroto → refluxo → Moro/Travesseiro só como apoio secundário)
 *   TESTE 006  RN 10d  (janela crítica 23h–02h — pergunta "ANTES ou DEPOIS da mamada?" NO INÍCIO,
 *                       sem contaminação do turno anterior (não mencionar "berço" se a queixa não envolveu berço),
 *                       lista de aulas enxuta: Mamadas Efetivas, Passo 4, Estimule o Arroto, Charutinho/Moro)
 *   TESTE 006  RN 22d  (chupeta cai isolada — pergunta forma de alimentação ANTES da sequência prática,
 *                       sinais de saciedade ADAPTADOS à forma de alimentação (peito vs fórmula),
 *                       sem repetição da frase canônica "posição vertical por 30 a 40 minutos",
 *                       consistência de gênero intra-frase (feminino: "se ela cair e a bebê continuar... se ela acordar"),
 *                       não-associação EXPLÍCITA: "nessa fase a chupeta não representa associação comportamental negativa")
 *   TESTE 006  RN 23d  (charutinho + sonecas só no colo — sequência prática final OBJETIVA e ENXUTA,
 *                       reforço EXPLÍCITO "travesseiro sobre o colo com contenção é PARTE DO PROCESSO, NÃO FALHA",
 *                       frase de não-associação AMPLIADA: dormir no colo + dormir no peito + precisar de contenção)
 *
 * Layer A: deterministic — rules, prompts, forbidden, signals (no LLM)
 * Layer B: end-to-end — processTurn (LLM if OPENAI_API_KEY, else local fallback)
 *
 * Run with:  node src/scripts/simulateTeste006RNJune22.js
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSystemPrompt } from '../prompts/systemPrompt.js';
import { extractSignals } from '../services/signalExtractor.js';
import { processTurn } from '../services/zlayaPipeline.js';
import { config } from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const knowledge = path.join(__dirname, '..', 'knowledge', 'rn');

function strip(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function pass(label) { console.log(`  \u2713 ${label}`); return 0; }
function fail(label, detail = '') { console.log(`  \u2717 ${label}${detail ? ` \u2014 ${detail}` : ''}`); return 1; }

// ─── Layer A: infrastructure ───────────────────────────────────────────────

const NEW_RULE_IDS = [
  // TESTE 006 — RN 6d
  'rn-berco-night-feeding-narrow-lessons',
  'rn-berco-night-feeding-hierarchy',
  'rn-feeding-form-question-at-opening-rn-6d',
  // TESTE 006 — RN 10d
  'rn-night-hunger-questions-open-response',
  'rn-no-previous-context-contamination',
  // TESTE 006 — RN 22d
  'rn-feeding-form-question-before-practical-sequence',
  'rn-pacifier-not-negative-association-explicit',
  'rn-satiety-signs-feeding-form-adaptive',
  'rn-vertical-time-not-repeated',
  'rn-pacifier-gender-consistency-intra-sentence',
  // TESTE 006 — RN 23d
  'rn-broaden-no-neg-assoc-include-lap-breast-contention',
  'rn-travesseiro-on-lap-is-part-of-process-not-failure',
];

const PROMPT_FRAGMENTS = [
  // RN 6d — intent canônica + hierarquia + aulas a retirar
  'rn_noite_mamada_insuficiente_berco',
  'hierarquia oficial da resposta',
  'aulas a retirar da recuperação principal',
  'aulas prioritárias para este cenário: mamadas efetivas, estimule o arroto, o que é o refluxo',
  // RN 10d — pergunta no início + sem contaminação
  'no primeiro paragrafo da resposta',
  'arvore condicional',
  'eixo que abre o raciocinio do caso',
  'nao contamine a resposta com elementos do turno anterior',
  'antes de tentar coloca-la no berco a noite',
  // RN 22d — pergunta forma de alimentação ANTES + não-associação explícita + sem repetir vertical
  'a pergunta sobre forma de alimentacao deve vir antes da sequencia pratica',
  'nessa fase a chupeta nao representa associacao comportamental negativa',
  'mantenha o genero gramatical consistente',
  'orientacao de posicao vertical por 30 a 40 minutos apos a mamada deve aparecer uma unica vez',
  'sinais de saciedade adaptados a forma de alimentacao',
  // RN 23d — sequência prática enxuta + travesseiro é parte do processo + não-associação ampliada
  'sequencia pratica final enxuta e ordenada',
  'travesseiro sobre o colo com contencao e parte do processo, nao falha',
  'dormir no colo, dormir no peito e precisar de contencao',
];

const FORBIDDEN_FRAGMENTS = [
  // RN 22d — alternância de gênero intra-frase
  'alternar genero gramatical dentro da mesma frase',
  // RN 10d — pergunta no final + contaminação do turno anterior
  'deixar a pergunta indispensavel \'antes ou depois da mamada?\' apenas no final',
  'contaminar a resposta atual com elementos do turno anterior',
  // RN 22d — forma de alimentação depois da sequência + repetição vertical + saciedade voltada só ao peito
  'fazer a pergunta sobre forma de alimentacao (peito, formula ou complemento) depois de ja ter dado a sequencia pratica',
  'repetir a frase canonica completa \'posicao vertical por 30 a 40 minutos\'',
  'listar \'solta o peito espontaneamente\' como sinal universal de saciedade',
  // RN 22d — chupeta sem dizer explicitamente não-associação
  'abordar queixa de chupeta no rn apenas como reflexo de succao sem dizer explicitamente que nessa fase a chupeta nao representa associacao comportamental negativa',
  // RN 23d — não-associação restrita ao colo + descrever travesseiro sem reforço
  'tranquilizar sobre nao-associacao negativa no rn mencionando apenas \'dormir no colo\'',
  'descrever a etapa intermediaria do travesseiro (sobre o colo com contencao) sem reforcar explicitamente',
  // RN 6d — aulas a retirar da recuperação principal
  'indicar \'estrategia do travesseiro\', \'charutinho e reflexos de moro\' (como recuperacao principal)',
];

function runInfrastructureChecks() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('LAYER A \u2014 Infrastructure (rules / prompt / forbidden / signals)');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  let bad = 0;
  const rules = JSON.parse(readFileSync(path.join(knowledge, 'rules.json'), 'utf-8'));
  const forbidden = JSON.parse(readFileSync(path.join(knowledge, 'forbidden.json'), 'utf-8'));
  const sysNorm = strip(buildSystemPrompt({ namespace: 'RN', band: { label: 'RN (0\u201328 dias)' } }));
  const forbNorm = strip(forbidden.forbiddenInterpretations.join(' \u2022 '));

  console.log('\n--- New fixed rules (TESTE 006) ---');
  for (const id of NEW_RULE_IDS) {
    bad += rules.fixedRules.some((r) => r.id === id) ? pass(`rule "${id}" present`) : fail(`rule "${id}" missing`);
  }

  console.log('\n--- System prompt fragments (TESTE 006) ---');
  for (const frag of PROMPT_FRAGMENTS) {
    bad += sysNorm.includes(strip(frag)) ? pass(`prompt has "${frag}"`) : fail(`prompt missing "${frag}"`);
  }

  console.log('\n--- Forbidden interpretations (TESTE 006) ---');
  for (const frag of FORBIDDEN_FRAGMENTS) {
    bad += forbNorm.includes(strip(frag)) ? pass(`forbidden has "${frag}"`) : fail(`forbidden missing "${frag}"`);
  }

  console.log('\n--- Signal extraction (TESTE 006 cases) ---');
  const signalCases = [
    {
      id: 'rn-6d',
      ageDays: 6,
      message:
        'Beb\u00ea 6 dias, estabelecendo uma rotina. Faz todas as sonecas no ber\u00e7o, mas a noite n\u00e3o quer ficar no ber\u00e7o. ' +
        'Estou tendo que pega-lo e leva-lo para o meu quarto. o que pode ser?',
      must: ['crib_ok_day_problem_night'],
    },
    {
      id: 'rn-10d',
      ageDays: 10,
      message:
        'Beb\u00ea de 10 dias. Sigo janelas de sono com minha filha de 1h acordada e dorme por 3h. ' +
        'Durante o dia d\u00e1 certo, mas quando chega na madrugada no hor\u00e1rio de dormir de 23h \u00e0s 02h ela n\u00e3o consegue dormir ' +
        'e fica nervosa sugando as m\u00e3ozinhas e choramingando. Ser\u00e1 que sonecas com dura\u00e7\u00e3o de 3 horas est\u00e1 muito para ela? Devo diminuir?',
      must: ['night_hunger_signs_rn', 'asks_nap_duration_rn'],
    },
    {
      id: 'rn-22d-pacifier-isolated',
      ageDays: 22,
      message:
        'Ol\u00e1, minha beb\u00ea tem 22 dias. Ela est\u00e1 usando chupeta devido \u00e0 necessidade de suc\u00e7\u00e3o, ' +
        'por\u00e9m, quando ela dorme com a chupeta, ela acorda porque a chupeta cai e preciso ficar colocando novamente. ' +
        'Como consigo resolver?',
      must: ['pacifier_in_rn', 'pacifier_isolated_complaint'],
    },
    {
      id: 'rn-23d-charutinho-night-naps-difficult',
      ageDays: 23,
      message:
        'Minha beb\u00ea tem 23 dias, dorme bem \u00e0 noite por cerca de 3 horas, mas apenas com charutinho. ' +
        'Sem o charutinho, apresenta muitos espasmos pelo reflexo de Moro e desperta. ' +
        'Durante o dia, as sonecas est\u00e3o mais dif\u00edceis: mama bem, dorme no colo, mas acorda logo ' +
        'ao ser colocada no ber\u00e7o ou no Mois\u00e9s, mesmo com t\u00e9cnica do travesseiro, ru\u00eddo e controle de luminosidade. ' +
        'A d\u00favida principal \u00e9 o que mais pode ser feito para a beb\u00ea se acostumar a dormir fora do colo.',
      must: ['charutinho_night_only_rn', 'travesseiro_tried_without_success'],
    },
  ];
  for (const sc of signalCases) {
    const sig = extractSignals({ message: sc.message, conversation: [], ageBand: 'RN', ageDays: sc.ageDays });
    const ids = sig.signals.map((s) => s.id);
    console.log(`\n  ${sc.id}: ${ids.join(', ') || '\u2014'}`);
    for (const m of sc.must) bad += ids.includes(m) ? pass(`signal "${m}"`) : fail(`signal "${m}" not fired`);
  }

  console.log(`\nLayer A result: ${bad === 0 ? 'ALL PASS' : bad + ' FAILED'}`);
  return bad === 0;
}

// Helper — checks if a substring appears in the FIRST OPENING portion of the
// text (first ~600 normalized chars by default). Used to verify questions
// appear NEAR THE TOP rather than the end. TESTE 006 introduces ordering
// requirements (RN 10d, RN 6d) that the previous test suite did not enforce.
function inOpening(normText, re, openingChars = 600) {
  const head = normText.slice(0, openingChars);
  return re.test(head);
}

// ─── Layer B: end-to-end ───────────────────────────────────────────────────

const E2E = [
  {
    id: 'teste-006-rn-6d',
    label: 'TESTE 006 \u2014 RN 6 dias (ber\u00e7o ok de dia + problema s\u00f3 \u00e0 noite \u2014 pergunta forma de alimenta\u00e7\u00e3o NO IN\u00cdCIO + aulas enxutas)',
    profile: { motherName: '\u2014', babyName: 'bb', ageDays: 6 },
    message:
      'Beb\u00ea 6 dias, estabelecendo uma rotina. Faz todas as sonecas no ber\u00e7o, mas a noite n\u00e3o quer ficar no ber\u00e7o. ' +
      'Estou tendo que pega-lo e leva-lo para o meu quarto. o que pode ser?',
    checks: (text, result) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b6\s*dias\b/.test(n)) issues.push('must cite explicit age "6 dias"');
      // TESTE 006 RN 6d — pergunta forma de alimenta\u00e7\u00e3o NO IN\u00cdCIO
      const feedingFormRE =
        /(mama no peito[,\s]+formula ou os dois|mama no peito[,\s]+formula ou complemento|peito[,\s]+formula ou os dois|peito[,\s]+formula ou complemento|forma de alimentacao)/;
      if (!feedingFormRE.test(n))
        issues.push('TESTE 006 RN 6d: must ask feeding form ("peito, fórmula ou os dois?")');
      if (!inOpening(n, feedingFormRE, 800))
        warn.push('nuance: feeding form question should appear in the opening (first ~800 chars)');
      // Hip\u00f3tese principal mantida
      if (!/(mamada noturna|producao.*(noite|noturna)|menor producao|baixa producao|menor transferencia|menor fluxo)/.test(n))
        issues.push('must name mamada noturna / baixa produção materna no período da noite');
      // Sinais de saciedade
      if (!/(solta o peito|relaxa o corpo|abre as mao|reduz o ritmo|sinais de saciedade)/.test(n))
        issues.push('must list sinais de saciedade');
      // POSI\u00c7\u00c3O VERTICAL 30 A 40 MIN
      if (!/(30\s*(a|–|-|—|ate|até)\s*40\s*(min|minutos))/.test(n))
        issues.push('must include vertical "30 a 40 minutos" EXPLICITLY');
      // Materiais centrais OBRIGAT\u00d3RIOS (TESTE 006 RN 6d)
      if (!/(mamadas efetivas|amamenta)/.test(n))
        issues.push('TESTE 006 RN 6d: must cite MAMADAS EFETIVAS como aula prioritária');
      if (!/(estimule o arroto|estimul[ae].{0,10}arroto)/.test(n))
        warn.push('nuance: ideally cite Estimule o Arroto');
      // Materiais a RETIRAR da recupera\u00e7\u00e3o principal (TESTE 006 RN 6d)
      if (/troca dia[\s\-]?noite|trocar o dia pela noite/.test(n))
        issues.push('TESTE 006 RN 6d: must NOT recommend Troca dia-noite as principal');
      if (/inicio do sono noturno|estabeleca o horario do inicio do sono noturno/.test(n))
        issues.push('TESTE 006 RN 6d: must NOT recommend Início do Sono Noturno as principal');
      if (/passo 4: atencao a alimentacao associada ao sono.{0,80}(prioritari|principal|central)/.test(n))
        issues.push('TESTE 006 RN 6d: must NOT position Passo 4 as principal recovery material');
      // Linguagem cautelosa de produ\u00e7\u00e3o
      if (/(a producao de leite da mae diminui apos as 18h|a producao cai apos as 18h)/.test(n))
        issues.push('must NOT use categorical phrasing about production drop after 18h');
      // N\u00e3o presumir ordenha/complemento
      if (/(continue ordenhando|sua ordenha|avalie sua ordenha|mesmo com complemento|continue com o complemento)/.test(n))
        issues.push('must NOT assume mother is doing ordenha or offering complement');
      result.__warnings = warn; return issues;
    },
  },
  {
    id: 'teste-006-rn-10d',
    label: 'TESTE 006 \u2014 RN 10 dias (janela cr\u00edtica 23h\u201302h \u2014 pergunta ANTES/DEPOIS NO IN\u00cdCIO + sem contamina\u00e7\u00e3o de "ber\u00e7o" + aulas enxutas)',
    profile: { motherName: '\u2014', babyName: 'bb', ageDays: 10 },
    message:
      'Beb\u00ea de 10 dias. Sigo janelas de sono com minha filha de 1h acordada e dorme por 3h. ' +
      'Durante o dia d\u00e1 certo, mas quando chega na madrugada no hor\u00e1rio de dormir de 23h \u00e0s 02h ela n\u00e3o consegue dormir ' +
      'e fica nervosa sugando as m\u00e3ozinhas e choramingando. Ser\u00e1 que sonecas com dura\u00e7\u00e3o de 3 horas est\u00e1 muito para ela? Devo diminuir?',
    checks: (text, result) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b10\s*dias\b/.test(n)) issues.push('must cite explicit age "10 dias"');
      // Resposta direta sobre dura\u00e7\u00e3o
      if (!/(2h?30\s*(a|–|-|—|ate|até)\s*3h?|2[,\.]?30\s*(a|–|-|—|ate|até)\s*3|2[,\.]?5\s*h)/.test(n)
          && !/(podem ser esperadas|nao e necessario diminuir|sao esperadas|nao precisa diminuir)/.test(n))
        issues.push('must respond DIRECTLY: sonecas de 2h30 a 3h são esperadas — não é necessário diminuir');
      // Sinal claro de fome
      if (!/(sinal.{0,10}(claro|forte)\s+de\s+fome|sinais.{0,10}(classicos|fortes|claros)\s+de\s+fome|isso\s+e\s+sinal\s+de\s+fome|indicam?\s+fome|comportamento.{0,20}(indica|sugere|aponta)\s+fome)/.test(n))
        issues.push('must mark sugar mãozinhas + nervosismo + choramingo as SINAL CLARO DE FOME');
      // TESTE 006 RN 10d — pergunta "ANTES ou DEPOIS da mamada?" NO IN\u00cdCIO
      const beforeOrAfterRE =
        /(antes\s+ou\s+depois\s+da\s+mamada|antes\s+da\s+mamada\s+ou\s+depois|depois\s+da\s+mamada\s+ou\s+antes|esse\s+comportamento.{0,80}(antes|depois)\s+da\s+mamada)/;
      if (!beforeOrAfterRE.test(n))
        issues.push('must ask "esse comportamento acontece ANTES ou DEPOIS da mamada?"');
      if (!inOpening(n, beforeOrAfterRE, 700))
        issues.push('TESTE 006 RN 10d: pergunta "ANTES ou DEPOIS da mamada?" deve aparecer NO IN\u00cdCIO da resposta (primeiros ~700 chars), não no final');
      // Ramos condicionais
      if (!/(se\s+(for\s+)?antes.{0,80}(alimentar|oferec|mamar|livre demanda)|antes.{0,40}alimentar)/.test(n))
        warn.push('nuance: ideally include the branch "se ANTES da mamada → alimentar (livre demanda)"');
      if (!/(se\s+(for\s+)?depois.{0,200}(mamada efetiv|sucao ativa|saciedade|producao)|depois.{0,80}(investigar|verificar|avaliar).{0,80}(mamada|producao|saciedade))/.test(n))
        warn.push('nuance: ideally include the branch "se DEPOIS da mamada → investigar mamada efetiva/produção/saciedade"');
      // Sinais de saciedade
      if (!/(solta o peito|relaxa o corpo|abre as mao|reduz o ritmo|sinais de saciedade)/.test(n))
        issues.push('must list sinais de saciedade');
      // POSI\u00c7\u00c3O VERTICAL 30 A 40 MIN
      if (!/(30\s*(a|–|-|—|ate|até)\s*40\s*(min|minutos))/.test(n))
        issues.push('must include vertical 30 a 40 minutos when mentioning vertical');
      // TESTE 006 RN 10d — sem contamina\u00e7\u00e3o "antes de tentar colocá-la no berço à noite"
      if (/(antes de tentar coloca-la no berco a noite|antes de coloca-la no berco a noite)/.test(n))
        issues.push('TESTE 006 RN 10d: must NOT contaminate with "antes de tentar colocá-la no berço à noite" — m\u00e3e n\u00e3o perguntou sobre ber\u00e7o');
      // N\u00e3o presumir ordenha/complemento
      if (/(continue\s+ordenhando|sua\s+ordenha|avalie\s+sua\s+ordenha|continua\s+ordenhando|sigo?\s+a\s+ordenha)/.test(n))
        issues.push('must NOT assume mother is doing ordenha');
      if (/(mesmo\s+com\s+(o\s+)?complemento|continue\s+com\s+o\s+complemento|seu\s+complemento|ajuste\s+do\s+complemento)/.test(n))
        issues.push('must NOT assume mother is offering complement');
      // Aulas estritas (TESTE 006 RN 10d)
      if (/(inicio do sono noturno|troca dia[\s\-]?noite|trocar o dia pela noite|estabeleca o horario do inicio)/.test(n))
        issues.push('must NOT recommend Início do Sono Noturno / Troca dia-noite as principal lessons');
      if (!/(mamadas efetivas|passo 4|alimentacao associada ao sono|charutinho)/.test(n))
        warn.push('nuance: ideally cite Mamadas Efetivas / Passo 4 / Charutinho as principal lessons');
      // Condicional peito × f\u00f3rmula × complemento
      if (!/(se\s+(ela|ele)\s+mama\s+no\s+peito|mama\s+no\s+peito.{0,40}livre\s+demanda|formula\s+ou\s+complemento|forma\s+de\s+alimentacao)/.test(n))
        issues.push('must adapt closing to feeding form (conditional)');
      result.__warnings = warn; return issues;
    },
  },
  {
    id: 'teste-006-rn-22d-pacifier-isolated',
    label: 'TESTE 006 \u2014 RN 22 dias (chupeta isolada \u2014 forma de alimenta\u00e7\u00e3o ANTES da sequ\u00eancia + sem repetir vertical + g\u00eanero consistente + n\u00e3o-associa\u00e7\u00e3o expl\u00edcita)',
    profile: { motherName: '\u2014', babyName: 'bb', ageDays: 22 },
    message:
      'Ol\u00e1, minha beb\u00ea tem 22 dias. Ela est\u00e1 usando chupeta devido \u00e0 necessidade de suc\u00e7\u00e3o, ' +
      'por\u00e9m, quando ela dorme com a chupeta, ela acorda porque a chupeta cai e preciso ficar colocando novamente. ' +
      'Como consigo resolver?',
    checks: (text, result) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b22\s*dias\b/.test(n)) issues.push('must cite explicit age "22 dias"');
      // Necessidade de suc\u00e7\u00e3o fisiol\u00f3gica
      if (!/(necessidade de succao|reflexo de succao|sucao.{0,30}(fisiologic|esperad|regulac))/.test(n))
        issues.push('must frame the necessidade de suc\u00e7\u00e3o as fisiol\u00f3gica / esperada nessa fase');
      // Manejo: se cair e continua dormindo, n\u00e3o precisa recolocar
      if (!/(nao precisa recolocar|n[\u00e3a]o precisa ser recolocada|sem precisar recolocar|n[\u00e3a]o e necessario recolocar)/.test(n))
        issues.push('must orient "se a chupeta cai e a beb\u00ea continua dormindo, n\u00e3o precisa recolocar"');
      // TESTE 006 RN 22d — forma de alimenta\u00e7\u00e3o
      const feedingFormRE = /(mama no peito|formula ou complemento|peito.{0,40}formula|forma de alimentacao|peito[,\.\s]+formula)/;
      if (!feedingFormRE.test(n))
        issues.push('must ask forma de alimenta\u00e7\u00e3o (peito, f\u00f3rmula ou complemento)');
      // POSI\u00c7\u00c3O VERTICAL 30 A 40 MIN
      if (!/(30\s*(a|–|-|—|ate|até)\s*40\s*(min|minutos))/.test(n))
        issues.push('must include vertical "30 a 40 minutos" EXPLICITLY');
      // Sinais de saciedade
      if (!/(solta o peito|relaxa o corpo|abre as mao|reduz o ritmo|sinais de saciedade)/.test(n))
        issues.push('must list sinais de saciedade');
      // TESTE 006 RN 22d — sinais de saciedade ADAPTADOS \u00e0 forma de alimenta\u00e7\u00e3o
      // se f\u00f3rmula/mamadeira \u00e9 mencionado como alternativa, deve ter "reduz o ritmo" como sinal aplic\u00e1vel
      if (!/(se\s+mama\s+no\s+peito.{0,80}solta\s+o\s+peito|solta\s+o\s+peito.{0,80}se\s+usa\s+formula|se\s+usa\s+formula.{0,80}(reduz|relaxa|saciedade|oferta)|formula\s+ou\s+mamadeira.{0,80}(reduz|relaxa|saciedade|oferta)|qualquer\s+forma\s+de\s+alimentacao)/.test(n))
        warn.push('nuance: ideally adapt sinais de saciedade for fórmula/complemento (TESTE 006 RN 22d)');
      // TESTE 006 RN 22d — n\u00e3o-associa\u00e7\u00e3o EXPL\u00cdCITA
      const explicitNotNegAssocRE =
        /(nessa\s+fase[,\s]+(a\s+chupeta\s+)?n[\u00e3a]o\s+(deve\s+ser\s+|representa\s+|configura\s+|caracteriza\s+)?(interpretad[ao]\s+como\s+)?associa[\u00e7c][\u00e3a]o\s+(comportamental\s+)?negativa|n[\u00e3a]o\s+representa\s+associa[\u00e7c][\u00e3a]o\s+comportamental\s+negativa|aind?a?\s+nao\s+cria\s+associac[a\u00e3]o\s+comportamental\s+negativa)/;
      if (!explicitNotNegAssocRE.test(n))
        issues.push('TESTE 006 RN 22d: must EXPLICITLY state that "nessa fase a chupeta n\u00e3o representa associa\u00e7\u00e3o comportamental negativa"');
      // TESTE 006 RN 22d — gen\u00earo consistente intra-frase
      if (/se\s+a\s+chupeta\s+cair[\s\S]{0,80}o\s+bebe\s+continuar\s+dormindo/.test(n))
        issues.push('TESTE 006 RN 22d: gender drift intra-frase \u2014 "se a chupeta cair ... o beb\u00ea continuar dormindo" deveria ser "... a beb\u00ea continuar dormindo"');
      if (/se\s+ele\s+acordar\s+logo\s+que\s+(a\s+)?(chupeta\s+)?cai/.test(n))
        issues.push('TESTE 006 RN 22d: gender drift \u2014 "se ele acordar logo que cai" deveria ser "se ela acordar logo que cai"');
      // TESTE 006 RN 22d — sem repeti\u00e7\u00e3o da frase can\u00f4nica "posi\u00e7\u00e3o vertical por 30 a 40 minutos"
      const verticalCanonicalCount = (n.match(/posicao\s+vertical(?:\s+(?:por|durante))?\s+(?:de\s+)?30\s*(?:a|–|-|—|ate|at[eé])\s*40\s*(?:min(?:utos)?|m)\b/g) || []).length;
      if (verticalCanonicalCount > 1)
        issues.push(`TESTE 006 RN 22d: a frase can\u00f4nica "posi\u00e7\u00e3o vertical por 30 a 40 minutos" apareceu ${verticalCanonicalCount} vezes \u2014 deve aparecer uma \u00fanica vez`);
      // PROIBI\u00c7\u00d5ES gerais (mantidas do TESTE 005)
      if (/refluxo patologico/.test(n))
        issues.push('must NOT escalate to refluxo patol\u00f3gico');
      if (/(elevacao do colchao em 45|colchao em 45 graus|colchao.{0,8}45\u00b0)/.test(n))
        issues.push('must NOT recommend mattress elevation 45\u00b0');
      if (/(estrategia do travesseiro|sonecas no travesseiro|travesseiro.{0,40}colo)/.test(n))
        issues.push('must NOT include Estrat\u00e9gia do Travesseiro block (chupeta isolada)');
      if (/\b(se ele mama|ele mama no peito|ele suga ativamente|ele solta o peito|ele relaxa o corpo|seu beb[eê])\b/.test(n))
        issues.push('must respect feminine gender ("minha beb\u00ea", "ela")');
      result.__warnings = warn; return issues;
    },
  },
  {
    id: 'teste-006-rn-23d-charutinho-night-naps-difficult',
    label: 'TESTE 006 \u2014 RN 23 dias (charutinho s\u00f3 \u00e0 noite + colo \u2014 sequ\u00eancia pr\u00e1tica final ORDENADA + travesseiro \u00e9 PARTE DO PROCESSO + n\u00e3o-associa\u00e7\u00e3o ampliada)',
    profile: { motherName: '\u2014', babyName: 'bb', ageDays: 23 },
    message:
      'Minha beb\u00ea tem 23 dias, dorme bem \u00e0 noite por cerca de 3 horas, mas apenas com charutinho. ' +
      'Sem o charutinho, apresenta muitos espasmos pelo reflexo de Moro e desperta. ' +
      'Durante o dia, as sonecas est\u00e3o mais dif\u00edceis: mama bem, dorme no colo, mas acorda logo ' +
      'ao ser colocada no ber\u00e7o ou no Mois\u00e9s, mesmo com t\u00e9cnica do travesseiro, ru\u00eddo e controle de luminosidade. ' +
      'A d\u00favida principal \u00e9 o que mais pode ser feito para a beb\u00ea se acostumar a dormir fora do colo.',
    checks: (text, result) => {
      const issues = []; const warn = []; const n = strip(text);
      if (!/\b23\s*dias\b/.test(n)) issues.push('must cite explicit age "23 dias"');
      // Moro fisiol\u00f3gico / esperado
      if (!/(reflexo de moro.{0,200}(fisiologic|esperad|comum|normal|impactand?o?|impactar|conter|fase)|moro.{0,200}(fisiologic|esperad|comum|normal|impactand?o?|impactar|conter|fase|adaptacao)|esperad[ao].{0,200}(reflexo de moro|moro)|comum.{0,200}(reflexo de moro|moro)|charutinho.{0,40}(conter|reflexo de moro)|padrao\s+pode\s+ocorrer.{0,40}fase.{0,200}moro)/.test(n))
        issues.push('must frame reflexo de Moro as fisiol\u00f3gico / esperado / comum nessa fase');
      // Charutinho TAMB\u00c9M de dia
      if (!/(charutinho\s+tambem\s+durante\s+o\s+dia|charutinho.{0,80}(durante o dia|tambem.{0,30}dia|nas sonecas diurnas|durante as sonecas diurnas|tambem.{0,20}sonecas)|tambem.{0,40}charutinho.{0,40}(dia|sonecas diurnas)|use.{0,40}charutinho.{0,40}dia)/.test(n))
        issues.push('must orient charutinho TAMB\u00c9M durante o dia');
      // "mama bem" \u2260 mamada efetiva
      if (!/("?mama bem"?\s+nao\s+(confirma|garante|significa|equivale)|n[\u00e3a]o\s+confirma\s+mamada\s+efetiv|"?mama bem"?\s+nao\s+e\s+suficiente.{0,40}(efetiv|mamada)|isso\s+nao\s+confirma\s+mamada\s+efetiv|nao\s+(quer|significa)\s+dizer\s+que\s+a\s+mamada\s+esta\s+efetiv)/.test(n))
        issues.push('TESTE 006 RN 23d: must explain that "mama bem" does NOT confirm mamada efetiva');
      // Travesseiro com etapa intermedi\u00e1ria
      if (!/(travesseiro\s+(em\s+cima|sobre)\s+(do|o)\s+colo|sonecas?.{0,40}travesseiro.{0,40}colo|travesseiro.{0,40}colo.{0,80}contenc[a\u00e3]o)/.test(n))
        issues.push('must orient Travesseiro corrigido: travesseiro em cima do colo com conten\u00e7\u00e3o');
      // TESTE 006 RN 23d — refor\u00e7o EXPL\u00cdCITO "parte do processo, n\u00e3o falha"
      const partOfProcessRE =
        /(travesseiro\s+sobre\s+o\s+colo\s+com\s+contenc[\u00e3a]o\s+e\s+parte\s+do\s+processo[,\s]+nao\s+falha|parte\s+do\s+processo[,\s]+nao\s+falha|nao\s+e\s+falha[,\s]+e\s+parte\s+do\s+processo|e\s+parte\s+legitima.{0,40}processo|e\s+parte\s+do\s+processo)/;
      if (!partOfProcessRE.test(n))
        issues.push('TESTE 006 RN 23d: must EXPLICITLY reinforce "travesseiro sobre o colo com conten\u00e7\u00e3o \u00e9 PARTE DO PROCESSO, N\u00c3O FALHA"');
      // TESTE 006 RN 23d — n\u00e3o-associa\u00e7\u00e3o AMPLIADA (colo + peito + conten\u00e7\u00e3o)
      const broadenedNoNegAssocRE =
        /(dormir\s+no\s+colo[,\s]+dormir\s+no\s+peito[,\s]+(ou\s+)?precisar\s+de\s+contenc[a\u00e3]o|dormir\s+no\s+colo[,\s]+(dormir\s+)?no\s+peito[,\s]+(ou\s+)?(precisar\s+de\s+)?contenc[a\u00e3]o|no\s+colo[,\s]+no\s+peito[,\s]+(ou\s+)?(precisar\s+de\s+)?contenc[a\u00e3]o|colo[,\s]+peito[,\s]+(ou\s+)?(necessitar\s+de\s+|precisar\s+de\s+)?contenc[a\u00e3]o)/;
      if (!broadenedNoNegAssocRE.test(n))
        issues.push('TESTE 006 RN 23d: frase de n\u00e3o-associa\u00e7\u00e3o deve contemplar TR\u00caS modos legitimos (dormir no colo + dormir no peito + precisar de conten\u00e7\u00e3o)');
      // POSI\u00c7\u00c3O VERTICAL 30 A 40 MIN
      if (!/(30\s*(a|–|-|—|ate|at\u00e9)\s*40\s*(min|minutos))/.test(n))
        issues.push('must include vertical "30 a 40 minutos" EXPLICITLY');
      // RN n\u00e3o cria associa\u00e7\u00e3o negativa
      if (!/(aind?a?\s+nao\s+cria|nao\s+cria\s+associacao\s+(comportamental\s+)?negativa|nao\s+e\s+associacao\s+negativa|nao\s+e\s+vicio|nao\s+e\s+manha|nao\s+e\s+mau\s+habito)/.test(n))
        issues.push('must reassure "com 23 dias ainda n\u00e3o cria associa\u00e7\u00e3o negativa"');
      // Mamada efetiva concreta
      if (!/(sucao ativa|suga\s+(de\s+forma\s+)?ativ|deglutic[a\u00e3]o\s+(audivel|audiv|aud\u00edvel)|saciedade.{0,80}(solta|relaxa|abre|reduz)|busca\s+precoce.{0,40}peito)/.test(n))
        issues.push('must investigate mamada efetiva concretely');
      // Aulas inadequadas
      if (/(estabeleca o horario do inicio do sono noturno|inicio do sono noturno|evite que o bebe troque o dia pela noite|troca dia[\s\-]?noite|trocar o dia pela noite)/.test(n))
        warn.push('nuance: prefer NOT to recommend In\u00edcio do Sono Noturno / Troca dia-noite');
      // G\u00eanero feminino
      if (/\b(se ele mama|ele mama no peito|ele suga ativamente|ele solta o peito|ele relaxa o corpo|seu beb[eê])\b/.test(n))
        issues.push('must respect feminine gender');
      result.__warnings = warn; return issues;
    },
  },
];

async function runE2EChecks() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log(`LAYER B \u2014 End-to-end (engine: ${config.openai.apiKey ? 'OpenAI LLM' : 'local fallback'})`);
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  let passCount = 0, failCount = 0;
  for (const c of E2E) {
    console.log(`\n--- ${c.label} ---`);
    const sig = extractSignals({ message: c.message, conversation: [], ageBand: 'RN', ageDays: c.profile.ageDays });
    const result = await processTurn({ message: c.message, babyProfile: c.profile, conversation: [], conversationId: `sim-${c.id}` });
    const text = result.response?.text || '';
    console.log(`route   : ${result.route}`);
    console.log(`intent  : ${result.intent?.intent}`);
    console.log(`signals : ${sig.signals.map((s) => s.id).join(', ')}`);
    console.log(`source  : ${result.response?.source || result.responseSource || '\u2014'}`);
    console.log('--- response ---');
    console.log(text);
    console.log('--- checks ---');
    const issues = c.checks(text, result, sig);
    const warnings = result.__warnings || [];
    if (issues.length === 0) {
      passCount++; console.log('STATUS: \u2705 PASS');
    } else {
      failCount++; console.log('STATUS: \u274c FAIL');
      for (const i of issues) console.log(`  \u2717 ${i}`);
    }
    for (const w of warnings) console.log(`  \u26a0 ${w}`);
  }
  console.log(`\nLayer B result: ${passCount} passed, ${failCount} failed (of ${E2E.length})`);
  return failCount === 0;
}

async function main() {
  console.log('ZLAYA LAB \u2014 Simulation TESTE 006 (22/06/2026) RN 6/10/22/23 dias');
  const a = runInfrastructureChecks();
  const b = await runE2EChecks();
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  if (a && b) console.log('OVERALL: \u2705 All layers passed \u2014 TESTE 006 corrections appear correctly implemented.');
  else console.log('OVERALL: \u26a0 Some checks failed/flagged \u2014 review items above.');
  process.exit(a && b ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
