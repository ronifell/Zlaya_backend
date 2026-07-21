# TESTE 011 — Consolidado para o desenvolvedor

Batch de avaliações oficiais do **Zlaya Lab** para a versão RN (0–28 dias).
Este documento resume o que precisa ser implementado / mantido no backend a
partir do Teste 011.

Fontes primárias (integrais):

- [`rn-16d.md`](./rn-16d.md) — sonda + mama bem + busca <2h
- [`rn-22d.md`](./rn-22d.md) — chupeta caindo / recolocar

Notas complementares do batch (redação / Charutinho na lista textual) já
foram cobertas pelo TESTE 010 (`rn-teste010-travesseiro-charutinho-lista-textual`
e enriquecedores associados) — este batch exige **não-regressão**.

## 1. Tabela comparativa

| Caso | Nota 010 | Nota 011 | Δ | Status | Prioridade |
| --- | ---: | ---: | ---: | --- | --- |
| RN 16d — sonda / produção | 9,6 | **9,4** | −0,2 | Aprovada c/ ajustes mínimos | Baixa |
| RN 22d — chupeta | 9,7 | **9,6** | −0,1 | Aprovado c/ ajustes mínimos | Baixa |

## 2. O que já está correto (manter)

### RN 16d (sonda + mama bem)

- Preservar idade 16 dias e faixa RN.
- Não usar icterícia/linguinha como causa ativa atual.
- Priorizar baixa produção materna / necessidade de suporte de produção.
- Relacionar hipótese ao complemento com sonda.
- Investigar produção e deglutição no fim da tarde/noite.
- Orientar sinais de saciedade, vertical 30–40 min, livre demanda.
- Ordenhas no fim da tarde e ao longo do dia.
- Indicar "Amamentação Prática e Descomplicada".
- Avaliar complemento no final da tarde **e** durante o dia.

### RN 22d (chupeta)

- Chupeta como apoio fisiológico de sucção/regulação.
- Não tratar como associação comportamental negativa.
- Confirmar forma de alimentação (peito / fórmula / complemento).
- Mamada efetiva, saciedade, arroto, vertical 30–40, ambiente, charutinho se Moro.
- Se cair e continuar dormindo → não recolocar; se acordar → investigar causa.
- Aulas: Mamadas Efetivas, Reflexo de Sucção, Estimule o Arroto.

## 3. Correções a implementar no Teste 011

### 3.1 RN 16d — sonda + mama bem (prioridade baixa)

1. **Abertura sem normalização**: não dizer que é comum padrões de busca pelo
   peito nessa fase quando há sonda + busca <2h — conduzir direto para
   produção, complemento e suficiência.
2. **Trava metodológica explícita**: se a mãe diz que agora mama bem,
   icterícia e procedimento na linguinha devem aparecer **explicitamente**
   como histórico, não só ficar omitidos.
3. **Pergunta investigativa do complemento**: incluir "durante o dia" na
   mesma pergunta (não só "final da tarde").
4. **Gênero**: "ela continua" / "se ela mama" (não "ele").
5. **Limpeza textual**: evitar repetição de blocos e fechamento gramatical
   truncado.

Formulação ideal:

> "Pelo padrão que você descreve, com busca pelo peito em intervalo menor
> que 2h começando no final da tarde e piorando na madrugada, a principal
> hipótese é baixa produção materna ou necessidade de suporte de produção
> nesse período, especialmente porque sua bebê já recebe complemento com
> sonda. Esse déficit pode ocorrer também durante o dia. Por isso, é
> importante avaliar se o complemento também precisa ser ajustado no final
> da tarde e durante o dia, além de considerar ordenhas como apoio à
> produção. Como você informou que agora ela mama bem, icterícia e
> procedimento na linguinha ficam apenas como histórico, não como causa
> atual."

### 3.2 RN 22d — chupeta (prioridade baixa)

1. **Segurança obrigatória**: sempre incluir "nunca prender ou fixar a
   chupeta" — a queixa é justamente a chupeta cair.
2. **Hierarquia ideal**:
   1. Chupeta como apoio fisiológico (não associação negativa)
   2. Resposta direta: se cair e dormir → não recolocar; se acordar → investigar
   3. Segurança: nunca prender/fixar
   4. Confirmar forma de alimentação
   5. Sequência prática (saciedade, arroto, vertical, ambiente, charutinho, berço)
3. **Saciedade adaptada** a fórmula/complemento (não só peito).
4. **Frase truncada**: corrigir
   "Após a mamada, depois de arrotar e de ser mantida em posição vertical
   antes de transferir para o berço."
5. **"Evitar refluxo"**: preferir "ajuda a reduzir desconfortos pós-mamada e
   favorece a transição" — sem prometer evitar refluxo.

## 4. Regras metodológicas a codificar

| ID sugerido | Regra |
| --- | --- |
| `rn-teste011-sonda-no-normalize-padroes-busca` | Com sonda + busca <2h, não normalizar abertura com "comum padrões de busca pelo peito". |
| `rn-teste011-ictericia-linguinha-trava-explicita` | Com "mama bem", explicitar que icterícia/linguinha ficam apenas como histórico. |
| `rn-teste011-complemento-pergunta-inclui-dia` | Pergunta sobre complemento deve incluir "durante o dia", não só final da tarde. |
| `rn-teste011-gender-ela-bebe` | Manter "ela" / "a bebê" quando a mãe usa feminino. |
| `rn-teste011-chupeta-nunca-prender-obrigatorio` | Em queixa de chupeta caindo, sempre incluir "nunca prender ou fixar a chupeta". |
| `rn-teste011-chupeta-hierarquia-direta` | Resposta direta sobre cair/recolocar + segurança antes da sequência longa. |
| `rn-teste011-chupeta-saciedade-adaptada` | Sinais de saciedade adaptados a peito × fórmula/complemento. |
| `rn-teste011-chupeta-nao-prometer-evitar-refluxo` | Não escrever "para evitar refluxo"; usar redução de desconforto pós-mamada. |
| `rn-teste011-vertical-frase-completa` | Corrigir frase truncada de vertical antes de transferir ao berço. |

## 5. Não-regressão do Teste 010 / 009

Preservar:

- `rn-teste010-sonda-no-over-normalization-abertura`
- `rn-teste010-producao-fraseologia-canonica`
- `rn-teste010-travesseiro-charutinho-lista-textual`
- `rn-teste009-ictericia-linguinha-historical-only`
- `rn-teste009-complement-evaluate-day-and-afternoon`
- `rn-pacifier-no-securing`

## 6. Próximos passos técnicos

1. Regras em `src/knowledge/rn/rules.json` (`rn-teste011-*`).
2. Enriquecedores em `src/services/safetyValidator.js`.
3. Wiring em `zlayaPipeline.js` + reforço em `systemPrompt.js` / `signalExtractor.js`.
4. Script `src/scripts/simulateTeste011Features.js`.
