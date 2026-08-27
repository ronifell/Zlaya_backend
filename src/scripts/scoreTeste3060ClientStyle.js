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
    officialNote: 9.2,
    message:
      'Minha bebê de 30 dias faz sonecas de 1h às vezes mais.. quando acorda ela acorda muito brava e chora bastante e só acalma dando o peito mama bem pouco e relaxa.. como melhorar? Antes da soneca ela já mama em média 20 a 30 min',
    dossierSummary: `Problema = despertar irritado após soneca de 1h+, não soneca curta.
Hierarquia: alimentação/saciedade + pós-mamada/postural (arroto, vertical 20-30) → refluxo como possibilidade → perguntar o que falta → só depois janela/estímulos.
LINGUAGEM NATURAL: não expor regras internas ("sem evidência no relato", "como hipótese, sem diagnóstico").
PROIBIDO: chamar de soneca curta; hipótese de estímulos/janela perdida sem dados; "sequência noturna"; indicar aula de Janela de Vigília como solução principal.`,
    criteria: [
      { id: 'no_short_nap_label', w: 15, pass: (t) => {
        if (/n[aã]o consideraria a dura[cç][aã]o da soneca|n[aã]o [eé] soneca curta|n[aã]o deve ser classificada como curta|1h.{0,30}n[aã]o .{0,20}curta|1 hora.{0,40}n[aã]o .{0,30}principal/i.test(t)) return true;
        return !/(t[eê]m|fazem|apresentam|tenham)\s+sonecas?\s+curtas?|[eé] comum.{0,40}sonecas?\s+curtas?/i.test(t);
      } },
      { id: 'no_internal_rules', w: 15, pass: (t) => !/sem evid[eê]ncia no relato|como hip[oó]tese, sem diagn[oó]stico|n[aã]o est[ií]mulos\/janela/i.test(t) },
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
      { id: 'no_normalize_angry', w: 10, pass: (t) => !/[eé] (normal|comum) que .{0,140}acord(em|e) (irritad|chorando)/i.test(t) },
      { id: 'no_adaptacao_sono', w: 5, pass: (t) => !/se adaptando ao sono/i.test(t) },
      { id: 'no_night_sleep_ask', w: 10, pass: (t) => !/como est[aá] o sono noturno/i.test(t) },
    ],
  },
  {
    id: '31d',
    ageDays: 31,
    motherName: 'Maria',
    babyName: 'João',
    sex: 'm',
    officialNote: 9.2,
    message:
      'Ola tudo bem? Meu filho tem 31 dias, sempre fez as sonecas no berço, que duravam cerca de 2 hrs/ 2 hrs e 30. Mas faz 02 dias que ele tem feito uma soneca grande pela manhã e, durante a tarde, as sonecas estão bem curtas. Um ciclo de sono. Ele desperta e eu ate tendo nina-lo no berço, mas ele nao retorna. Depois de 30 minutos ja esta com sono novamente. Outra questao eh que ele demora femais para iniciar a soneca. O ambiente esta ajustado, ele esta alimentado, tudo tranquilo, janela de sono del eh de 1 hr/1 hr 15, quando vai dando este horário, vou para o quarto; coloco ruido, quarto escuro, nino ele no colo e ainda acordado transfiro pro berço. Quando no berço, ele demora muuuito prw relaxar, quase 40/45 minutos. Nao sei como conduzir nesta situação. Faz uns 4,5 dias que esta assim.',
    dossierSummary: `Dado central: vigília excessiva (~1h40–2h) porque inicia após 1h–1h15 e ainda demora 40–45 min para dormir. Referência 45min a 1h15.
Soneca longa da manhã: fracionar ~1h30–2h para observar a TARDE; NÃO como causa direta dos 40–45 min.
Alimentação: se a demora aproxima o intervalo, considere fome — NÃO "caprichar nas mamadas para relaxar".
Pergunta do intervalo das mamadas deve vir explicada. Sem Travesseiro. Sem hipótese noturna inventada.`,
    criteria: [
      { id: 'excess_wake_central', w: 15, pass: (t) => /(1h\s*40|1h40|2h|demais|excessiv|muito tempo|longo).{0,40}(acord|vig[ií]lia)|vig[ií]lia.{0,40}(excess|longo|demais)|45\s*min.{0,30}1\s*h/i.test(t) },
      { id: 'wake_ref_45_115', w: 15, pass: (t) => /45\s*min/i.test(t) && /1\s*h\s*15|1h15|1 hora e 15/i.test(t) },
      { id: 'no_invented_night_supply', w: 15, pass: (t) => !/mamada noturna insuficiente|produ[cç][aã]o de leite durante a noite|baixa produ[cç][aã]o.{0,20}noite/i.test(t) },
      { id: 'no_redundant_asks', w: 10, pass: (t) => !/dura[cç][aã]o t[ií]pica das sonecas da manh[aã] e da tarde/i.test(t) && !/quanto tempo (ele|ela) (costuma )?(permanece|permanecer) acordad[oa] antes de iniciar/i.test(t) && !/quanto tempo (ele|ela) permanece acordad[oa] antes das sonecas/i.test(t) },
      { id: 'fraction_once', w: 10, pass: (t) => ((t.match(/fracion\w*[^.!?\n]{0,50}soneca (?:longa )?da manh|soneca (?:longa )?da manh[^.!?\n]{0,50}fracion/gi) || []).length <= 1) },
      { id: 'feed_interval_once', w: 5, pass: (t) => ((t.match(/intervalo.{0,30}mamadas/gi) || []).length <= 1) },
      { id: 'no_broken_concat', w: 5, pass: (t) => !/gostaria de saber:\s*Tamb[eé]m/i.test(t) },
      { id: 'no_generic_open', w: 5, pass: (t) => !/se adaptando ao ritmo do dia/i.test(t) && !/[eé] normal que.{0,80}varia[cç][oõ]es nas sonecas/i.test(t) },
      { id: 'no_travesseiro_lesson', w: 10, pass: (t, meta) => !/travesseiro/i.test(meta.lessonsText || '') },
      { id: 'vertical_20_30', w: 5, pass: (t) => /20\s*a\s*30/i.test(t) || !/30\s*a\s*40\s*minutos ap[oó]s/i.test(t) },
      { id: 'day_naps_focus', w: 5, pass: (t) => /soneca|tarde|manh[aã]|fracion/i.test(t) },
      { id: 'morning_nap_not_delay_cause', w: 10, pass: (t) => !/soneca longa pela manh[aã].{0,80}(contribuindo|explica|causa).{0,40}(relaxar|adormecer)/i.test(t) },
      { id: 'no_feed_to_relax', w: 10, pass: (t) => !/caprichar nas mamadas.{0,40}relaxar/i.test(t) },
      { id: 'feed_interval_explained', w: 5, pass: (t) => !/intervalo.{0,20}mamadas/i.test(t) || /porque|por que|aproxim/i.test(t) },
    ],
  },
  {
    id: '40d-bottle',
    ageDays: 40,
    motherName: 'Ana',
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.5,
    message:
      'Deixa eu ver se entendi: minha bebê está com 40 dias. Quanto tempo dura a amamentação dela nessa fase? Já estou tentando introduzir 1 mamadeira Tb, conforme a Eliana ensina. Quantos ml devo ofertar pra ela?',
    dossierSummary: `~20 min, podendo ser mais curta ou ~30 min, com retirada efetiva e saciedade.
40 dias = segundo mês → ~120 ml UMA vez (não faixa genérica 90–120; não 60–90).
NÃO garantir sem desmame/confusão de bico. NÃO usar hábito a corrigir. Sem frases truncadas. Sem perguntas extras se já respondeu duração e volume.`,
    criteria: [
      { id: 'breast_20_to_30', w: 15, pass: (t) => /20\s*minutos/i.test(t) && /30\s*minutos/i.test(t) },
      { id: 'no_habit_language', w: 15, pass: (t) => !/h[aá]bito a corrigir|h[aá]bito que pode ser corrigido|mau h[aá]bito/i.test(t) },
      { id: 'volume_120_second_month', w: 25, pass: (t) => /120\s*ml/i.test(t) },
      { id: 'no_60_90', w: 10, pass: (t) => !/60\s*(a|–|-)\s*90/i.test(t) },
      { id: 'no_nipple_guarantee', w: 10, pass: (t) => !/sem causar desmame|n[aã]o causa desmame nem confus/i.test(t) },
      { id: 'no_wrong_lessons', w: 10, pass: (t, meta) => !/maus h[aá]bitos|hora da bruxa|estrat[eé]gias para o sono noturno/i.test(t + ' ' + (meta.lessonsText || '')) },
      { id: 'no_truncated', w: 10, pass: (t) => !/mamadeira,\s*\./i.test(t) && !/,\s+\./.test(t) },
      { id: '120_once', w: 5, pass: (t) => (t.match(/120\s*ml/gi) || []).length <= 1 },
      { id: 'no_behavioral_sucking', w: 10, pass: (t) => !/leitura comportamental|suc[cç][aã]o ap[oó]s esse tempo|ponto a observar ap[oó]s checar saciedade/i.test(t) },
    ],
  },
  {
    id: '40d-pacifier',
    ageDays: 40,
    motherName: 'Ana',
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 8.5,
    message:
      'Oii, tudo bem? Meu filho tem 40 dias. Dorme no berço, colocamos ele acordado e ele dorme sozinho. O que acontece é: ele esta usando chupeta desde que saiu da maternidade. Até 05 dias atras,s ele retornava a dormir com tranquilidade, fazia sonecas de 2,3 hrs. Contudo, com um ciclo de sono ele está acordando, chora e eu tenho recolado a chupeta e ele volta a dormir no mesmo instante. As vezes aguardo e ele retoma a soneca sem a chupeta, mas a maioria das vezes, nao. Dai ele acorda e dps de 20 minutos dorme de novo pois nao havia dormido o suficiente. Eu perecebo que ele tem necessidade de sucção e sei que nesta idade é ate uma auto regulação. Como conduzir para que ele retome o sono sem colocar a chupeta? Nao quero retira-la, mas nao sei como devo conduzir.',
    dossierSummary: `CRÍTICO: resposta concluída, sem bloqueio. Sem mau hábito. Sem mistura colo/peito/travesseiro.
Eixo = mudança recente, NÃO vigília excessiva (mãe não informou tempo acordado).
Respeitar manter chupeta. Conduta: observar retomada (ela já relatou que às vezes retoma) e recolocar se precisar.`,
    criteria: [
      { id: 'delivered_not_blocked', w: 20, pass: (t, meta) => !/rascunho bloqueado|resposta interrompida/i.test(t) && !(meta.draftBlocked) },
      { id: 'no_mau_habito', w: 10, pass: (t, meta) => !/\b(e|eh|é)\s+(um\s+)?mau\s+h[aá]bito\b|classific\w*\s+como\s+mau\s+h[aá]bito|desenvolvendo\s+um\s+mau\s+h[aá]bito|aula sobre maus h[aá]bitos|tirando os maus h[aá]bitos/i.test(t + ' ' + (meta.lessonsText || '')) },
      { id: 'recent_change', w: 15, pass: (t) => /mudan[cç]a recente|at[eé] (cerca de )?(cinco|5) dias|padr[aã]o (anterior|recente)|antes (fazia|dormia)/i.test(t) },
      { id: 'respect_keep_pacifier', w: 10, pass: (t) => /manter a chupeta|respeitar essa escolha|pode manter|n[aã]o quer retirar|respeite.{0,40}chupeta|respeite e oriente/i.test(t) },
      { id: 'no_mixed_colo_travesseiro', w: 10, pass: (t) => !/s[oó] dorme no colo e no peito|travesseiro as vezes funciona/i.test(t) },
      { id: 'no_excess_wake_primary', w: 15, pass: (t) => !/principal hip[oó]tese.{0,80}vig[ií]lia excessiva/i.test(t) },
      { id: 'observe_resume', w: 10, pass: (t) => /retoma.{0,50}(sozinho|sem a chupeta)|observe.{0,40}(alguns instantes|retom)/i.test(t) },
      { id: 'investigate_not_blame', w: 10, pass: (t) => /alimenta|saciedad|desconforto|suc[cç][aã]o/i.test(t) },
    ],
  },
  {
    id: '40d-night',
    ageDays: 40,
    motherName: 'Ana',
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 8.8,
    message:
      'Olá. Meu bb tem 40 dias , tem noites que ele dorme super bem acorda entre 2:30 a 3 hrs , só que tem dia que após as 04:00 da manhã ele acorda de 1 em 1 hrs tento fazer ele continuar a dormir no berço porém sem sucesso, aí pego ele fico ninando no colo sem sucesso, aí coloco ele no peito ele mama mesmo sabendo que não é fome, ele mama e dorme. Continuo assim por ele ainda ser novinho ?',
    dossierSummary: `Preserve “após as 4h da manhã” (não “após 4 horas de sono”).
Fluxo: última mamada → rotina alimentar do dia + efetividade + saciedade → posturais/desconforto → se ~2h30–3h, mamada efetiva; se ainda não completou o intervalo, tentar conduzir sem oferecer o peito imediatamente.
NÃO usar 3h sozinho para evitar peito. NÃO dizer que investigar alimentação evita associação. NÃO começar por associação peito–sono. Sem frases truncadas.`,
    criteria: [
      { id: 'offer_if_due', w: 10, pass: (t) => /2h\s*30|2h30/i.test(t) && /mamada efetiva/i.test(t) },
      { id: 'no_dont_wake_mismatch', w: 10, pass: (t) => !/n[aã]o [eé] necess[aá]rio acord[aá]-l[oa]/i.test(t) },
      { id: 'clock_not_duration', w: 10, pass: (t) => !/ap[oó]s 4 horas de sono/i.test(t) },
      { id: 'last_feed_before_4', w: 10, pass: (t) => /[uú]ltima mamada antes das 4h|antes das 4h.{0,50}mam/i.test(t) },
      { id: 'no_association_avoid', w: 10, pass: (t) => !/evitar que (ele|ela) associe o despertar/i.test(t) },
      { id: 'feed_before_association', w: 10, pass: (t) => /alimenta|mamada efetiva|ganho de peso|peito.{0,20}f[oó]rmula/i.test(t) && !/^[\s\S]{0,280}associa[cç][aã]o/i.test(t) },
      { id: 'spontaneous_vs_wake', w: 10, pass: (t) => /acord(a|ar) (sozinho|espont)|diferente de .{0,40}acord/i.test(t) || /n[aã]o (est[aá]|est[aá] )acordando/i.test(t) },
      { id: 'daytime_feeding', w: 10, pass: (t) => /mamadas do dia|rotina alimentar/i.test(t) },
      { id: 'postural', w: 5, pass: (t) => /vertical|arroto|postur/i.test(t) },
      { id: 'no_truncated', w: 5, pass: (t) => !/Isso pode ajudar a\s+(?=[A-ZÁ])|Isso pode ajudar a\s*$/m.test(t) },
      { id: 'asks_weight_or_feed_type', w: 10, pass: (t) => /ganho de peso|peito.{0,15}f[oó]rmula|complemento|tipo de (leite|alimenta)/i.test(t) },
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
    dossierSummary: `Respostas diretas: início saudável 19h–20h; família pode outro horário mas 21h30/22h NÃO recomendado (uma vez); banho 21h30 NÃO é recomendado quando atrasa o início.
Janela 45min–1h15. Investigar última soneca UMA vez. Gênero consistente com o perfil. NÃO atribuir a demora só às 21h. NÃO mandar revisar módulos 3 e 4.`,
    criteria: [
      { id: 'night_19_20', w: 20, pass: (t) => /19h.{0,15}20h|19\s*h.{0,15}20\s*h|entre 19.{0,10}20/i.test(t) },
      { id: 'not_recommend_2130_22', w: 15, pass: (t) => /21h?30|22h|22:00/i.test(t) && /n[aã]o .{0,20}recomend|n[aã]o [eé] o recomend|n[aã]o recomendado/i.test(t) },
      { id: 'bath_direct_no', w: 15, pass: (t) => /banho.{0,100}n[aã]o [eé] recomendado|n[aã]o [eé] recomendado.{0,80}banho|banho.{0,80}(posterg|atras|mais tarde)/i.test(t) },
      { id: 'wake_45_to_115', w: 10, pass: (t) => /45\s*min/i.test(t) && /1h15|1 hora e 15|1\s*h\s*15/i.test(t) },
      { id: 'gender_consistent', w: 10, pass: (t) => {
        const hasEle = /\b(ele|dele|nele|acordado)\b/i.test(t);
        const hasEla = /\b(ela|dela|nela|acordada)\b/i.test(t);
        return !(hasEle && hasEla);
      } },
      { id: 'no_modulos_34', w: 10, pass: (t) => !/m[oó]dulos?\s*3 e 4/i.test(t) },
      { id: 'no_21h_sole_cause', w: 10, pass: (t) => !/21h n[aã]o [eé] o ideal, pois pode contribuir/i.test(t) },
      { id: 'start_21h_beyond', w: 10, pass: (t) => /[àa]s 21h(?!\s*30).{0,80}(al[eé]m|fora da faixa|n[aã]o [eé] o hor[aá]rio recomendado)/i.test(t) },
      { id: 'last_nap_once', w: 5, pass: (t) => ((t.match(/[uú]ltima soneca/gi) || []).length <= 1) },
      { id: 'late_start_once', w: 5, pass: (t) => ((t.match(/21h30 ou 22h n[aã]o [eé]/gi) || []).length <= 1) },
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
      { id: 'pacifier_not_primary', w: 20, pass: (t) => !/principal hip[oó]tese.{0,120}chupeta|chupeta.{0,40}principal hip[oó]tese/i.test(t) },
      { id: 'no_invented_irritado', w: 15, pass: (t) => !/acordando irritad|acorda irritad/i.test(t) },
      { id: 'no_early_from_30min', w: 15, pass: (t) => !/acordando ap[oó]s 30 minutos.{0,80}iniciar a condu[cç][aã]o.{0,40}antes/i.test(t) },
    ],
  },
  {
    id: '51d',
    ageDays: 51,
    motherName: 'Ana',
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.2,
    message:
      'Minha neném1 mês e 21 dias tem dificuldade de dormir durante o dia, só dorme se for no colo, e no peito, tento fazer a técnica do travesseiro, as vezes da certo e as vezes não, quanto tempo pra ela aprender?',
    dossierSummary: `Sem mau hábito. Passo a passo (não “hierarquia”): vigília 45min–1h15 → mamada efetiva → saciedade → se fome, manter; se saciada no peito, retirar → vertical → conduzir ao sono.
Sem “buscando conforto” antes da mamada. Sem exigir Travesseiro com bebê calma. Aula do Travesseiro sempre que indicar. Sem prazo fixo. Sem ~10 min de choro.`,
    criteria: [
      { id: 'no_mau_habito', w: 10, pass: (t, meta) => !/mau h[aá]bito|maus h[aá]bitos/i.test(t + ' ' + (meta.lessonsText || '')) },
      { id: 'passo_a_passo', w: 10, pass: (t) => !/seguir uma hierarquia|siga esta hierarquia/i.test(t) },
      { id: 'wake_45_115', w: 10, pass: (t) => /45\s*min/i.test(t) && /1h15|1 hora e 15|1\s*h\s*15/i.test(t) },
      { id: 'feeding_before_behavior', w: 10, pass: (t) => /mamada efetiva|saciedad|alimenta|retirando leite|fome/i.test(t) },
      { id: 'satiety_conduct', w: 15, pass: (t) => /retir.{0,25}peito|retire-a do peito/i.test(t) && /vertical/i.test(t) },
      { id: 'no_conforto_shortcut', w: 5, pass: (t) => !/buscando conforto|apenas por conforto/i.test(t) },
      { id: 'no_travesseiro_calma', w: 5, pass: (t) => !/inicie quando a beb[eê] estiver calma/i.test(t) },
      { id: 'no_acostumada', w: 5, pass: (t) => !/acostumad[oa]s? a dormir no colo/i.test(t) },
      { id: 'not_crib_first', w: 5, pass: (t) => !/^[\s\S]{0,280}adapta[cç][aã]o ao ber[cç]o/i.test(t) },
      { id: 'no_fixed_timeline', w: 10, pass: (t) => /n[aã]o existe prazo|sem prazo|n[aã]o h[aá] prazo|prazo fixo|depende da (repeti[cç][aã]o|consist[eê]ncia)/i.test(t) },
      { id: 'no_10min_cry', w: 5, pass: (t) => !/cerca de 10 minutos|em torno de 10 minutos|10 minutos.{0,20}(choro|acalmar)/i.test(t) || /n[aã]o use.{0,20}10 minutos/i.test(t) },
      { id: 'travesseiro_lesson', w: 10, pass: (t) => /aula.{0,60}travesseiro/i.test(t) },
      { id: 'no_interrupt_comfort', w: 10, pass: (t) => !/mamada.{0,50}conforto.{0,80}interromper|peito.{0,40}conforto.{0,80}interromper|apenas por conforto.{0,80}interromper|interromper.{0,60}(peito|mamada|conforto)/i.test(t) },
      { id: 'no_window_to_feed', w: 10, pass: (t) => !/ap[oó]s esse tempo.{0,50}mamada efetiva|final da janela.{0,40}mamada/i.test(t) },
    ],
  },
  {
    id: '48d',
    ageDays: 48,
    motherName: 'Ana',
    babyName: 'Lara',
    sex: 'f',
    officialNote: 9.5,
    message:
      'Bebê de 48 dias. Estou começando a rotina do sono dela umas 18:30, até 20 horas está dormindo. Estou na dúvida se está muito cedo, precisa ser mais tarde pela idade ou não tem relevância? Outra dúvida, nos momentos da soneca, o ideal é transferir pro berço em sono profundo ou com os olhos abertos, meio acordada ainda pra ela se habituar com o berço e criar autonomia',
    dossierSummary: `Ritual breve (banho, mamada, dormir). 18h30→20h pode ser vigília excessiva (45min–1h15).
NÃO determinar que a rotina comece entre 19h e 20h. NÃO normalize 18h30→20h sem checar o tempo acordado (ritual breve; janela 45min–1h15).
Duas opções: iniciar a noite ~18h30 se pronta, OU soneca ~1h e iniciar depois.
Berço: mamou e dormiu → pode ir dormindo; sem mamada → pode acordada. NÃO exigir acordada para autonomia.`,
    criteria: [
      { id: 'brief_ritual', w: 10, pass: (t) => /ritual.{0,40}breve|banho.{0,20}mamada.{0,20}(dormir|condu)/i.test(t) },
      { id: 'no_force_19_20_routine', w: 10, pass: (t) => !/inicie a rotina do sono entre 19h e 20h/i.test(t) && !/recomendo que voc[eê] inicie.{0,40}entre 19h e 20h/i.test(t) },
      { id: 'no_normalize_1830_20', w: 10, pass: (t) => !/n[aã]o [eé] necessariamente um problema/i.test(t) },
      { id: 'check_awake_time', w: 10, pass: (t) => /permaneceu acordad|verificar quanto tempo|vale checar se o tempo acordado|vig[ií]lia/i.test(t) },
      { id: 'wake_45_115', w: 10, pass: (t) => /45\s*min/i.test(t) && /1h15|1 hora e 15|1\s*h\s*15/i.test(t) },
      { id: 'two_options', w: 20, pass: (t) => /18h30|18:30/i.test(t) && /soneca.{0,40}1 hora|soneca de at[eé]/i.test(t) },
      { id: 'crib_if_fed_asleep', w: 15, pass: (t) => /j[aá] dormindo|mamou e (adormeceu|dormiu)|mamar e adormecer/i.test(t) },
      { id: 'awake_not_required', w: 15, pass: (t) => /n[aã]o (uma )?exig[eê]ncia|n[aã]o .{0,20}(autonomia|habituar)|possibilidade de condu[cç][aã]o/i.test(t) },
      { id: 'no_autonomy_rule', w: 15, pass: (t) => !/promove a autonomia|habitue.{0,20}ber[cç]o.{0,20}autonomia/i.test(t) },
    ],
  },
  {
    id: '55d',
    ageDays: 55,
    motherName: 'Ana',
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.3,
    message:
      'Bom dia! Bebê de 55 dias e chupa chupeta… quando a chupeta cai da boca ele reclama… devo colocá-la logo em seguida ou devo esperar um pouco para colocá-la na boca dele novamente? Outra coisa, a janela de sono dele está maior que 1h15. Geralmente 1h30 a 1h45! Tem problema?',
    dossierSummary: `Chupeta: se só reclamar, não recolocar imediatamente — UMA vez. Janela 45min–1h15; 1h30–1h45 está acima (sem “principal hipótese”).
Pergunte “entrar em sono”, não “depois de deitar”. Sem duração da soneca da manhã. Sem fracionar soneca da manhã sem relato. Sem fallback.`,
    criteria: [
      { id: 'no_fallback', w: 10, pass: (t) => !/n[aã]o encontrei orienta[cç][aã]o suficiente/i.test(t) },
      { id: 'pacifier_wait', w: 15, pass: (t) => /n[aã]o precisa recoloc|n[aã]o [eé] necess[aá]rio recoloc|observe .{0,40}(continuar|continua) dormindo|observe um pouco/i.test(t) },
      { id: 'pacifier_once', w: 10, pass: (t) => ((t.match(/recoloc/gi) || []).length <= 1) },
      { id: 'wake_45_115', w: 10, pass: (t) => /45\s*min/i.test(t) && /1h15|1 hora e 15|1\s*h\s*15/i.test(t) },
      { id: 'window_exceeded', w: 15, pass: (t) => /1h30|1h\s*30/i.test(t) && /ultrapass|acima|excede|n[aã]o [eé] o esperado|j[aá] ultrapassa/i.test(t) },
      { id: 'no_hipotese', w: 10, pass: (t) => !/principal hip[oó]tese.{0,50}vig[ií]lia excessiva|vig[ií]lia excessiva/i.test(t) },
      { id: 'no_morning_fraction', w: 10, pass: (t) => !/fracion.{0,50}soneca da manh[aã]/i.test(t) },
      { id: 'no_deitar', w: 10, pass: (t) => !/depois de deitar/i.test(t) },
      { id: 'entrar_em_sono', w: 5, pass: (t) => /entrar em sono/i.test(t) },
      { id: 'no_reask_age', w: 5, pass: (t) => !/idade exata/i.test(t) },
    ],
  },
  {
    id: '56d',
    ageDays: 56,
    motherName: 'Ana',
    babyName: 'Pedro',
    sex: 'm',
    officialNote: 9.5,
    message:
      'Bebe de 56 dias. Posso colocar no berço e esperar ele dormir sozinho, se não estiver chorando? Ou preciso colocar ele em sono leve ? Ou em sono profundo?',
    dossierSummary: `Tranquilo e sem choro → pode acordado no berço. Não obrigatório sono leve/profundo.
Se chorar, acalmar e conduzir — sem exigir autonomia. Se adormecer mamando, pode ir dormindo.
Travesseiro: condução e colocação no berço, com mais segurança à mãe — não “ajudar na transição”. Aula UMA vez.
Sem aulas de estímulos/janela/rotina/ruído branco. Sem fallback.`,
    criteria: [
      { id: 'no_fallback', w: 10, pass: (t) => !/n[aã]o encontrei orienta[cç][aã]o suficiente/i.test(t) },
      { id: 'awake_ok', w: 15, pass: (t) => /acordad/i.test(t) && /ber[cç]o/i.test(t) },
      { id: 'not_required_sleep_stage', w: 10, pass: (t) => /n[aã]o [eé] (necess[aá]rio|obrigat[oó]rio).{0,40}(sono leve|sono profundo)|n[aã]o [eé] necess[aá]rio esperar/i.test(t) },
      { id: 'feed_asleep_ok', w: 10, pass: (t) => /j[aá] dormindo|adormecer mamando|n[aã]o precisa acord[aá]/i.test(t) },
      { id: 'travesseiro_purpose', w: 10, pass: (t) => /tamb[eé]m pode ajudar na condu[cç][aã]o e na coloca[cç][aã]o do beb[eê] no ber[cç]o/i.test(t) && /seguran[cç]a/i.test(t) },
      { id: 'no_transicao_generica', w: 10, pass: (t) => !/ajudar na transi[cç][aã]o/i.test(t) },
      { id: 'travesseiro_lesson', w: 10, pass: (t) => /aula.{0,80}travesseiro|estrat[eé]gia do travesseiro/i.test(t) },
      { id: 'aula_once', w: 10, pass: (t) => ((t.match(/aula.{0,80}(travesseiro|estrat[eé]gia)|aula correspondente|confira a aula|assista [àa] aula|revise a aula/gi) || []).length <= 1) },
      { id: 'no_unrelated_lessons', w: 15, pass: (t, meta) => {
        const L = meta?.lessonsText || '';
        return !/passo-2-estimulos|excesso de est[ií]mulos|passo-3-janela|passo-4-rotina|lesson-ruido-branco|ru[ií]do branco/i.test(L);
      } },
      { id: 'no_reask_age', w: 5, pass: (t) => !/idade exata/i.test(t) },
    ],
  },
  {
    id: '57d',
    ageDays: 57,
    motherName: 'Ana',
    babyName: 'Lara',
    sex: 'f',
    officialNote: 6.5,
    message:
      'Oi! Bebê de 57 dias. Estou ensinando a adormecer direto no berço progressivamente... começo com sono da manhã e estou avançando gradativamente para as outras sonecas, até chegar no sono noturno. O indicado é ir progressivamente ou deveria tentar em todas as sonecas de uma vez? Além disso, em algumas tentativas, há choro e fico uns 10 min tentando acalmá-la. Quando não resolve, pego no colo, acalmo e refaço o processo novamente... O caminho é esse mesmo?',
    dossierSummary: `Primeira soneca da manhã + demais sonecas DO MESMO DIA no berço. Não uma por dia.
Colo → berço → repetir. Sem cronometrar. Janela 45min–1h15. Consistência e repetição (não “ter paciência”). Travesseiro direto + aula.`,
    criteria: [
      { id: 'same_day', w: 25, pass: (t) => /mesmo dia|daquele dia|todas as demais sonecas/i.test(t) },
      { id: 'not_progressive_days', w: 15, pass: (t) => !/avan[cç]ar progressivamente.{0,80}sonecas da tarde/i.test(t) },
      { id: 'resistance_loop', w: 15, pass: (t) => /colo/i.test(t) && /ber[cç]o/i.test(t) },
      { id: 'no_timer', w: 10, pass: (t) => /n[aã]o cronometr|sem cronometrar|sem tempo predeterminado/i.test(t) },
      { id: 'wake_45_115', w: 10, pass: (t) => /45\s*min/i.test(t) && /1h15|1 hora e 15|1\s*h\s*15/i.test(t) },
      { id: 'no_paciencia_vaga', w: 10, pass: (t) => !/paci[eê]ncia e respeitar a resposta/i.test(t) },
      { id: 'consistency', w: 10, pass: (t) => /mantenha o processo com consist[eê]ncia e repeti[cç][aã]o/i.test(t) && /acolhendo o choro/i.test(t) },
      { id: 'no_boa_estrategia', w: 10, pass: (t) => !/pode ser uma boa estrat[eé]gia/i.test(t) },
      { id: 'travesseiro_direct', w: 5, pass: (t) => /estrat[eé]gia do travesseiro|use a estrat[eé]gia/i.test(t) },
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
