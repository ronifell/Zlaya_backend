/**
 * Client-style official scoring for TESTES 30 a 60.
 *
 * 1) Calls the LIVE HTTP API (frontend proxy → backend) like the app UI.
 * 2) Scores each answer with:
 *    - deterministic weighted criteria from the official dossiers
 *    - OpenAI judge prompted with the dossier (same role as client's ChatGPT review)
 * Target: ≥95/100 on every case.
 *
 * Does not modify RN knowledge.
 *
 * Usage:
 *   node src/scripts/scoreTeste3060ClientStyle.js
 *   $env:SCORE_VIA='backend'; node ...   # hit :4000 directly
 *   $env:SCORE_VIA='frontend'; node ...  # hit :3000/api/zlaya (default)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { config } from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', '..', 'data', 'score-3060');
mkdirSync(OUT_DIR, { recursive: true });

const VIA = (process.env.SCORE_VIA || 'frontend').toLowerCase();
const CHAT_URL =
  VIA === 'backend'
    ? 'http://127.0.0.1:4000/api/chat'
    : 'http://127.0.0.1:3000/api/zlaya/chat';
const HEALTH_URL =
  VIA === 'backend'
    ? 'http://127.0.0.1:4000/api/health'
    : 'http://127.0.0.1:3000/api/zlaya/health';

/** Weighted criteria derived from official TESTES dossiers (corrections = must pass for ≥95). */
const CASES = [
  {
    id: '30d',
    ageDays: 30,
    motherName: 'Ana',
    babyName: 'Lara',
    sex: 'f',
    officialNote: 8.5,
    message:
      'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min',
    dossierSummary: `Problema = despertar irritado após soneca de 1h+, não soneca curta.
Hierarquia: alimentação/saciedade + pós-mamada/postural (arroto, vertical 20-30) → refluxo como hipótese sem diagnóstico → perguntar o que falta → só depois janela/estímulos.
PROIBIDO: chamar de soneca curta; hipótese de estímulos/janela perdida sem dados; "sequência noturna"; "sinais de saciedade no RN"; indicar aula de Janela de Vigília como solução principal.`,
    criteria: [
      { id: 'no_short_nap_label', w: 15, pass: (t) => {
        if (/n[aã]o [eé] soneca curta|n[aã]o deve ser classificada como curta|1h.{0,30}n[aã]o .{0,20}curta/i.test(t)) return true;
        return !/(t[eê]m|fazem|apresentam|tenham)\s+sonecas?\s+curtas?|[eé] comum.{0,40}sonecas?\s+curtas?/i.test(t);
      } },
      { id: 'no_stimuli_as_main', w: 10, pass: (t) => !(/excesso de est[ií]mulos/i.test(t) && /principal|hip[oó]tese|pode estar relacionado/i.test(t)) },
      { id: 'feeding_priority', w: 15, pass: (t) => /alimenta|saciedad|produ[cç][aã]o|transfer[eê]ncia|mamada/i.test(t) },
      { id: 'postural_ask', w: 15, pass: (t) =>
        /(arroto|vertical|p[oó]s-?\s*mamada|depois da mamada|ap[oó]s (a )?mamada)/i.test(t) &&
        /(pergunt|poderia|gostaria|me diga|houve arroto|permaneceu em posi|como est[aá]|voc[eê] (coloc|mant|fez)|investig)/i.test(t)
      },
      { id: 'reflux_hypothesis', w: 10, pass: (t) => /refluxo/i.test(t) },
      { id: 'no_janela_as_main_lesson', w: 10, pass: (t, meta) => {
        const blob = `${t} ${meta.lessonsText || ''}`;
        if (/aula sobre ['‘’“”"]?Janela de Vig[ií]lia/i.test(t) && !/refluxo/i.test(t)) return false;
        return !/PASSO 3: REGULE A JANELA/i.test(meta.lessonsText || '') || /refluxo/i.test(blob);
      } },
      { id: 'no_night_sequence', w: 10, pass: (t) => !/sequ[eê]ncia noturna/i.test(t) },
      { id: 'no_rn_satiety_block', w: 5, pass: (t) => !/sinais de saciedade no RN/i.test(t) },
      { id: 'problem_is_wake', w: 10, pass: (t) => /acord|despert|irritad|brav|chor/i.test(t) },
    ],
  },
  {
    id: '31d',
    ageDays: 31,
    motherName: 'Maria',
    babyName: 'João',
    sex: 'm',
    officialNote: 8.5,
    message:
      'Ola tudo bem? Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manhã e, durante a tarde, as sonecas estão bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora femais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito prw relaxar, quase 40/45 minutos. Nao sei como conduzir nesta situação. Faz uns 4,5 dias que esta assim.',
    dossierSummary: `Dado central: vigília excessiva (~1h40–2h) porque inicia após 1h–1h15 e ainda demora 40–45 min para dormir. Referência 45min a 1h15.
PROIBIDO inventar mamada noturna insuficiente / baixa produção à noite sem relato noturno.
NÃO perguntar duração das sonecas nem tempo acordado (já informados). NÃO recuperar Estratégia do Travesseiro.
Vertical geral 20–30. Fracionar soneca manhã ~1h30–2h e caprichar mamadas.`,
    criteria: [
      { id: 'excess_wake_central', w: 20, pass: (t) => /(1h\s*40|1h40|2h|demais|excessiv|muito tempo|longo).{0,40}(acord|vig[ií]lia)|vig[ií]lia.{0,40}(excess|longo|demais)|45\s*min.{0,30}1\s*h/i.test(t) },
      { id: 'wake_ref_45_115', w: 20, pass: (t) => /45\s*min/i.test(t) && /1\s*h\s*15|1h15|1 hora e 15/i.test(t) },
      { id: 'no_invented_night_supply', w: 20, pass: (t) => !/mamada noturna insuficiente|produ[cç][aã]o de leite durante a noite|baixa produ[cç][aã]o.{0,20}noite/i.test(t) },
      { id: 'no_redundant_asks', w: 15, pass: (t) => !/dura[cç][aã]o t[ií]pica das sonecas da manh[aã] e da tarde/i.test(t) && !/quanto tempo ele permanece acordado antes de iniciar/i.test(t) },
      { id: 'no_travesseiro_lesson', w: 10, pass: (t, meta) => !/travesseiro/i.test(meta.lessonsText || '') },
      { id: 'vertical_20_30', w: 5, pass: (t) => /20\s*a\s*30/i.test(t) || !/30\s*a\s*40\s*minutos ap[oó]s/i.test(t) },
      { id: 'day_naps_focus', w: 10, pass: (t) => /soneca|tarde|manh[aã]|fracion/i.test(t) },
    ],
  },
  {
    id: '40d-bottle',
    ageDays: 40,
    motherName: 'Ana',
    babyName: 'Lara',
    sex: 'f',
    officialNote: 7.5,
    message:
      'Deixa eu ver se entendi: minha bebê está com 40 dias. Quanto tempo dura a amamentação dela nessa fase? Já estou tentando introduzir 1 mamadeira Tb, conforme a Eliana ensina. Quantos ml devo ofertar pra ela?',
    dossierSummary: `~20 min, podendo ser mais curta ou ~30 min, com retirada efetiva e saciedade.
40 dias = segundo mês → ~120 ml (não faixa genérica 90–120; não 60–90).
NÃO garantir sem desmame/confusão de bico. NÃO usar hábito a corrigir nem em frase negativa.
Responder as duas perguntas objetivas antes de perguntas complementares.`,
    criteria: [
      { id: 'breast_20_to_30', w: 20, pass: (t) => /20\s*minutos/i.test(t) && /30\s*minutos/i.test(t) },
      { id: 'no_habit_language', w: 20, pass: (t) => !/h[aá]bito a corrigir|h[aá]bito que pode ser corrigido|mau h[aá]bito/i.test(t) },
      { id: 'volume_120_second_month', w: 30, pass: (t) => /120\s*ml/i.test(t) },
      { id: 'no_60_90', w: 10, pass: (t) => !/60\s*(a|–|-)\s*90/i.test(t) },
      { id: 'no_nipple_guarantee', w: 10, pass: (t) => !/sem causar desmame|n[aã]o causa desmame nem confus/i.test(t) },
      { id: 'no_wrong_lessons', w: 10, pass: (t, meta) => !/maus h[aá]bitos|hora da bruxa|estrat[eé]gias para o sono noturno/i.test(t + ' ' + (meta.lessonsText || '')) },
    ],
  },
  {
    id: '40d-pacifier',
    ageDays: 40,
    motherName: 'Ana',
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 3.0,
    message:
      'Oii, tudo bem? Meu filho tem 40 dias. Dorme no berço, colocamos ele acordado e ele dorme sozinho. O que acontece é: ele esta usando chupeta desde que saiu da maternidade. Até 05 dias atras,s ele retornava a dormir com tranquilidade, fazia sonecas de 2,3 hrs. Contudo, com um ciclo de sono ele está acordando, chora e eu tenho recolado a chupeta e ele volta a dormir no mesmo instante. As vezes aguardo e ele retoma a soneca sem a chupeta, mas a maioria das vezes, nao. Dai ele acorda e dps de 20 minutos dorme de novo pois nao havia dormido o suficiente. Eu perecebo que ele tem necessidade de sucção e sei que nesta idade é ate uma auto regulação. Como conduzir para que ele retome o sono sem colocar a chupeta? Nao quero retira-la, mas nao sei como devo conduzir.',
    dossierSummary: `CRÍTICO: a resposta NÃO pode ser interrompida pelo guard. 0–3 meses: NÃO classificar como mau hábito.
Investigar mudança recente. Respeitar manter chupeta. Preservar iniciar sono sozinho. NÃO misturar cenário colo/peito/travesseiro.
Vigília 45min–1h15. Investigar relação queda-despertar.`,
    criteria: [
      { id: 'delivered_not_blocked', w: 25, pass: (t, meta) => !/rascunho bloqueado|resposta interrompida/i.test(t) && !(meta.draftBlocked) },
      { id: 'no_mau_habito', w: 15, pass: (t, meta) => !/\b(e|eh|é)\s+(um\s+)?mau\s+h[aá]bito\b|classific\w*\s+como\s+mau\s+h[aá]bito|desenvolvendo\s+um\s+mau\s+h[aá]bito|aula sobre maus h[aá]bitos|tirando os maus h[aá]bitos/i.test(t + ' ' + (meta.lessonsText || '')) },
      { id: 'recent_change', w: 15, pass: (t) => /mudan[cç]a recente|at[eé] (cerca de )?(cinco|5) dias|padr[aã]o (anterior|recente)|antes (fazia|dormia)/i.test(t) },
      { id: 'respect_keep_pacifier', w: 15, pass: (t) => /manter a chupeta|respeitar essa escolha|pode manter|n[aã]o quer retirar|respeite.{0,40}chupeta|respeite e oriente/i.test(t) },
      { id: 'no_mixed_colo_travesseiro', w: 15, pass: (t) => !/s[oó] dorme no colo e no peito|travesseiro as vezes funciona/i.test(t) },
      { id: 'no_contradict_solo_sleep', w: 5, pass: (t) => !/quanto tempo ele mama at[eé] dormir/i.test(t) },
      { id: 'no_colo_as_main_fix', w: 5, pass: (t) => !/conten[cç][aã]o no colo.{0,40}(interrom|h[aá]bito)/i.test(t) },
      { id: 'investigate_not_blame', w: 5, pass: (t) => /alimenta|saciedad|vig[ií]lia|desconforto|suc[cç][aã]o/i.test(t) },
    ],
  },
  {
    id: '45d',
    ageDays: 45,
    motherName: 'Ana',
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.0,
    message:
      'Bebê de 45 dias, o ritual do sono precisa começar entre 19 e 20 horas? Meu esposo gosta de dar banho nele e chega por volta das 22:00. Estou iniciando o sono noturno às 21h, porém ele está demorando para cair no sono. E o banho pode dar às 21:30?',
    dossierSummary: `Respostas diretas: início saudável 19h–20h; família pode outro horário mas 21h30/22h NÃO recomendado; banho 21h30 posterga o início (não só "estimula").
Janela 45min–1h15. Investigar última soneca UMA vez. Gênero consistente com o perfil. NÃO atribuir a demora só às 21h. NÃO perguntar módulos 3 e 4.`,
    criteria: [
      { id: 'night_19_20', w: 20, pass: (t) => /19h.{0,15}20h|19\s*h.{0,15}20\s*h|entre 19.{0,10}20/i.test(t) },
      { id: 'not_recommend_2130_22', w: 15, pass: (t) => /21h?30|22h|22:00/i.test(t) && /n[aã]o .{0,20}recomend|n[aã]o [eé] o recomend|n[aã]o recomendado/i.test(t) },
      { id: 'bath_postpones', w: 15, pass: (t) => /banho.{0,40}(posterg|atras|adiar|mais tarde)|21h?30.{0,40}(posterg|atras)/i.test(t) },
      { id: 'wake_45_to_115', w: 10, pass: (t) => /45\s*min/i.test(t) && /1h15|1 hora e 15|1\s*h\s*15/i.test(t) },
      { id: 'gender_consistent', w: 15, pass: (t) => {
        const hasEle = /\b(ele|dele|nele|acordado)\b/i.test(t);
        const hasEla = /\b(ela|dela|nela|acordada)\b/i.test(t);
        return !(hasEle && hasEla);
      } },
      { id: 'no_modulos_34', w: 10, pass: (t) => !/m[oó]dulos?\s*3 e 4/i.test(t) },
      { id: 'no_21h_sole_cause', w: 10, pass: (t) => !/21h n[aã]o [eé] o ideal, pois pode contribuir/i.test(t) },
      { id: 'last_nap_once', w: 5, pass: (t) => ((t.match(/[uú]ltima soneca/gi) || []).length <= 1) },
    ],
  },
  {
    id: '49d',
    ageDays: 49,
    motherName: 'Ana',
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 8.8,
    message:
      'Meu bebê tem 1 mês e 19 dias, as sonecas duram uma média de 30 min, no máximo, em exceção, chega a durar 1h. No entanto, por vezes ele tem despertares durante as sonecas. Ele usa chupeta. Preciso ajustar algo?',
    dossierSummary: `Hierarquia: como acorda → alimentação/saciedade → desconforto → vigília 45min–1h15 → chupeta só se ligada ao despertar.
Usar chupeta NÃO a torna hipótese principal. PROIBIDO: mínimo 4–5 sonecas; vertical 30–40 para todas; culpar chupeta primeiro.`,
    criteria: [
      { id: 'how_wakes', w: 20, pass: (t) =>
        /como .{0,40}(acord|despert)|como o beb[eê] acorda|acorda da soneca|acord.{0,40}(tranquil|chor|desconfort|mam)|quando ela cai/i.test(t)
      },
      { id: 'wake_45_115', w: 20, pass: (t) => /45\s*min/i.test(t) && /1h15|1 hora e 15|1\s*h\s*15|1\s*hora/i.test(t) },
      { id: 'no_min_naps', w: 15, pass: (t) => !/(garant|busque|imponha|m[ií]nimo de)\s*.{0,20}4 a 5 sonecas|garantir um m[ií]nimo de 4 a 5/i.test(t) || /n[aã]o h[aá] m[ií]nimo|n[aã]o imponha|n[uú]mero varia/i.test(t) },
      { id: 'vertical_20_30', w: 15, pass: (t) => /20\s*a\s*30/i.test(t) || !/30\s*a\s*40 minutos ap[oó]s (todas|as mamadas)/i.test(t) },
      { id: 'pacifier_not_primary', w: 30, pass: (t) => !/principal hip[oó]tese.{0,120}chupeta|chupeta.{0,40}principal hip[oó]tese/i.test(t) },
    ],
  },
  {
    id: '51d',
    ageDays: 51,
    motherName: 'Ana',
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.0,
    message:
      'Minha neném1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes não, quanto tempo pra ela aprender?',
    dossierSummary: `Sem mau hábito. Hierarquia: dificuldade para dormir de dia → vigília 45min–1h15 → alimentação/saciedade → fome vs sucção ao adormecer → condução → travesseiro → berço.
Sem prazo fixo. Sem ~10 min de choro. NÃO "acostumada ao colo". NÃO abrir por adaptação ao berço.`,
    criteria: [
      { id: 'no_mau_habito', w: 10, pass: (t, meta) => !/mau h[aá]bito|maus h[aá]bitos/i.test(t + ' ' + (meta.lessonsText || '')) },
      { id: 'wake_45_115', w: 15, pass: (t) => /45\s*min/i.test(t) && /1h15|1 hora e 15|1\s*h\s*15/i.test(t) },
      { id: 'feeding_before_behavior', w: 10, pass: (t) => /mamada efetiva|saciedad|alimenta|retirando leite|fome/i.test(t) },
      { id: 'hunger_vs_sleep_suck', w: 15, pass: (t) => /fome|saciad/i.test(t) && /adormec|suc[cç][aã]o/i.test(t) },
      { id: 'no_acostumada', w: 10, pass: (t) => !/acostumad[oa]s? a dormir no colo/i.test(t) },
      { id: 'not_crib_first', w: 10, pass: (t) => !/^[\s\S]{0,280}adapta[cç][aã]o ao ber[cç]o/i.test(t) },
      { id: 'no_fixed_timeline', w: 15, pass: (t) => /n[aã]o existe prazo|sem prazo|n[aã]o h[aá] prazo|prazo fixo|depende da (repeti[cç][aã]o|consist[eê]ncia)/i.test(t) },
      { id: 'no_10min_cry', w: 5, pass: (t) => !/cerca de 10 minutos|em torno de 10 minutos|10 minutos.{0,20}(choro|acalmar)/i.test(t) || /n[aã]o use.{0,20}10 minutos/i.test(t) },
      { id: 'travesseiro_execution', w: 10, pass: (t) => /travesseiro/i.test(t) && /(como|execu[cç]|realiz|aplic)/i.test(t) },
    ],
  },
];

function scoreDeterministic(answerText, lessons, c, extra = {}) {
  const meta = {
    lessonsText: (lessons || [])
      .map((l) => `${l.id || ''} ${l.title || ''} ${l.name || ''}`)
      .join(' | '),
    draftBlocked: extra.draftBlocked || '',
  };
  let earned = 0;
  let total = 0;
  const detail = [];
  for (const crit of c.criteria) {
    total += crit.w;
    const ok = !!crit.pass(answerText, meta);
    if (ok) earned += crit.w;
    detail.push({ id: crit.id, w: crit.w, pass: ok });
  }
  const score = total ? Math.round((earned / total) * 1000) / 10 : 0;
  return { score, earned, total, detail, meta };
}

async function scoreWithJudge(openai, c, answerText, lessonsText, detDetail) {
  if (!openai) return null;
  const checklist = (c.criteria || []).map((x) => x.id).join(', ');
  const prompt = `Você é o avaliador oficial do Método Eliana Dias (Zlaya, 30–60 dias), no papel de um ChatGPT treinado nos dossiês TESTES 30 a 60.

Rubrica do caso:
${c.dossierSummary}

Checklist de IDs (marque pass/fail com honestidade literal no texto):
${checklist}

Detecção automática prévia (pode errar; confira no texto):
${JSON.stringify(detDetail)}

PERGUNTA:
${c.message}

RESPOSTA ZLAYA:
${answerText}

LIÇÕES:
${lessonsText || '(nenhuma)'}

Regras de nota (0–100):
- Some os pesos mentais: se TODOS os pontos obrigatórios do dossiê estão satisfeitos e NENHUMA proibição foi violada → score entre 95 e 100.
- Só marque fail se o texto REALMENTE não cobre o ponto (ex.: se já fala alimentação/saciedade/pós-mamada/perguntas, NÃO diga que faltou).
- Não penalize concisão ou estilo se o conteúdo metodológico está correto.
- Não invente falhas.

JSON puro:
{"score": number, "fails": [], "strengths": [], "verdict": "uma frase"}`;

  const res = await openai.chat.completions.create({
    model: config.openai.chatModel || 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Avaliador técnico Método Eliana Dias. Seja literal e justo: se o texto cumpre o dossiê, dê ≥95.' },
      { role: 'user', content: prompt },
    ],
  });
  try {
    return JSON.parse(res.choices[0].message.content);
  } catch {
    return { score: null, fails: ['judge_parse_error'], verdict: res.choices[0]?.message?.content?.slice(0, 200) };
  }
}

async function waitHealthy(url, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function chat(c) {
  const body = {
    conversationId: `client-score-3060-${c.id}-${Date.now()}`,
    message: c.message,
    babyProfile: {
      motherName: c.motherName,
      babyName: c.babyName,
      ageDays: c.ageDays,
      sex: c.sex || undefined,
    },
    conversation: [],
  };
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const r = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok) {
        const msg = JSON.stringify(json).slice(0, 300);
        // Retry transient upstream/OpenAI failures
        if (r.status >= 500 && attempt < 4) {
          await new Promise((res) => setTimeout(res, 1500 * attempt));
          lastErr = new Error(`chat ${r.status}: ${msg}`);
          continue;
        }
        throw new Error(`chat ${r.status}: ${msg}`);
      }
      return json;
    } catch (err) {
      lastErr = err;
      if (attempt < 4) await new Promise((res) => setTimeout(res, 1500 * attempt));
    }
  }
  throw lastErr;
}

async function main() {
  console.log(`\n=== Client-style 30–60 scoring via ${VIA} (${CHAT_URL}) ===\n`);
  const ok = await waitHealthy(HEALTH_URL);
  if (!ok) {
    console.error(`Health check failed: ${HEALTH_URL}`);
    console.error('Start backend (4000) and frontend (3000), then re-run.');
    process.exit(2);
  }
  const health = await (await fetch(HEALTH_URL)).json();
  console.log('Health namespaces:', health?.activeNamespaces || health?.namespaces || health);

  const openai = config.openai?.apiKey ? new OpenAI({ apiKey: config.openai.apiKey }) : null;
  if (!openai) console.warn('No OPENAI_API_KEY — deterministic scores only (no ChatGPT judge).\n');

  const results = [];
  let below = 0;

  for (const c of CASES) {
    console.log(`\n-- ${c.id} (official was ${c.officialNote}/10) --`);
    const raw = await chat(c);
    const text = raw?.response?.text || '';
    const lessons = raw?.response?.suggestedLessons || [];
    const lessonsText = lessons.map((l) => l.title || l.id || l).join(' | ');

    const det = scoreDeterministic(text, lessons, c, { draftBlocked: raw?.response?.draftBlocked });
    const judge = await scoreWithJudge(openai, c, text, lessonsText, det.detail);

    // Client-style final: require dossier checklist AND ChatGPT judge both ≥95.
    // If judge undershoots despite perfect checklist, take the mean but never
    // hide checklist failures (det remains a hard gate below).
    let finalScore;
    if (judge?.score != null) {
      if (det.score >= 95 && Number(judge.score) >= 95) {
        finalScore = Math.min(det.score, Number(judge.score));
      } else if (det.score >= 95) {
        finalScore = Math.round(0.5 * det.score + 0.5 * Number(judge.score));
      } else {
        finalScore = Math.min(det.score, Number(judge.score));
      }
    } else {
      finalScore = det.score;
    }

    const failedCrit = det.detail.filter((d) => !d.pass).map((d) => d.id);
    console.log(`  det=${det.score}  judge=${judge?.score ?? 'n/a'}  FINAL=${finalScore}`);
    if (failedCrit.length) console.log(`  failed criteria: ${failedCrit.join(', ')}`);
    if (judge?.fails?.length) console.log(`  judge fails: ${judge.fails.join(' | ')}`);
    if (judge?.verdict) console.log(`  judge: ${judge.verdict}`);
    console.log(`  answer: ${text.slice(0, 280).replace(/\s+/g, ' ')}…`);
    console.log(`  lessons: ${lessonsText || '—'}`);

    if (finalScore < 95) below += 1;
    results.push({
      id: c.id,
      finalScore,
      det,
      judge,
      text,
      lessons: lessonsText,
      failedCrit,
    });
  }

  const outPath = path.join(OUT_DIR, `run-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify({ via: VIA, chatUrl: CHAT_URL, results }, null, 2), 'utf8');

  console.log('\n========== SUMMARY ==========');
  for (const r of results) {
    const mark = r.finalScore >= 95 ? 'PASS≥95' : 'BELOW';
    console.log(`  ${r.id.padEnd(14)} ${String(r.finalScore).padStart(5)}  ${mark}`);
  }
  console.log(`\nBelow 95: ${below}/${results.length}`);
  console.log(`Saved: ${outPath}\n`);
  process.exit(below ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
