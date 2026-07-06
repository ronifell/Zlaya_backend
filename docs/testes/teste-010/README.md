# TESTE 010 — Consolidado para o desenvolvedor

Batch de três avaliações oficiais do **Zlaya Lab** para a versão RN (0–28 dias).
Este documento resume o que precisa ser implementado / mantido no backend a
partir do Teste 010.

Fontes primárias (integrais):

- [`rn-13d.md`](./rn-13d.md) — choro no banho
- [`rn-16d.md`](./rn-16d.md) — sonda + mama bem + busca <2h
- [`rn-19d.md`](./rn-19d.md) — dorme só no colo / travesseiro tentado

## 1. Tabela comparativa

| Caso | Data | Nota 009 | Nota 010 | Δ | Status | Prioridade |
| --- | --- | ---: | ---: | ---: | --- | --- |
| RN 13d — banho | 03/07/2026 17:57 | 9,4 | **9,5** | +0,1 | Aprovada c/ ajustes | **Alta metodológica** |
| RN 16d — sonda / produção | 27/06/2026 13:48 | 8,9 | **9,6** | +0,7 | Aprovada c/ ajustes mínimos | Baixa |
| RN 19d — travesseiro / berço | 03/07/2026 18:45 | 8,7 | **9,0** | +0,3 | Aprovada c/ ajustes de redação | Baixa/média |

## 2. O que já está correto (manter)

### RN 13d (banho)

- Reconhecer choro no banho como comum em RN e associar a sensação de queda,
  insegurança ou frio.
- Orientações operacionais: fralda de pano, corpo mais submerso, posição de
  barriguinha para baixo apoiada no braço, ambiente aquecido, preparo antes do
  banho, banho curto, repetição/previsibilidade.
- Evitar banho logo após mamada cheia.

### RN 16d (sonda + mama bem)

- Icterícia e procedimento na linguinha tratados **apenas como histórico**
  quando a mãe diz que agora ela mama bem (trava do Teste 009 corrigida).
- Priorizar baixa produção materna / necessidade de suporte de produção.
- Reconhecer que complemento com sonda indica esse cenário.
- Avaliar complemento também no final da tarde e durante o dia (não apenas à
  noite).
- Orientar ordenhas no fim da tarde e ao longo do dia.
- Indicar "Amamentação Prática e Descomplicada".
- Sequência: oferecer peito → mamada efetiva → segundo peito se necessário →
  sinais de saciedade → arroto → vertical 30–40 min → ambiente calmo →
  charutinho se Moro/desorganização → transferência ao berço.

### RN 19d (travesseiro / berço)

- Não tratar como vício, manha, mau hábito ou associação negativa.
- Reforçar que com 19 dias a bebê **não cria associação comportamental
  negativa**.
- Adotar "transição do colo para a superfície do berço" (redação já corrigida
  do 009).
- Estratégia do Travesseiro como aula principal + assistir/reassistir +
  repetir exatamente como ensinado.
- Travesseiro sobre o colo nos primeiros dias, com contenção das mãos.
- Investigar queda de fluxo no fim da tarde ou começo da noite, sinais de
  saciedade, arroto, ambiente, Moro/desorganização, sinais de mamada
  insuficiente.
- Materiais: Mamadas Efetivas, Estimule o Arroto, Estratégia do Travesseiro,
  Berço do Bebê, Charutinho e os Reflexos de Moro.

## 3. Correções a implementar no Teste 010

### 3.1 RN 13d — banho (prioridade **alta metodológica**)

1. **Hierarquizar barriguinha/nariz para baixo como ação central**, não como
   tentativa secundária. Deve ser a **ação inicial** do banho — apoiado no
   braço do adulto, vias aéreas livres, apoio firme, controle total do corpo.
2. **Corrigir orientação de fome**: substituir "não esteja com muita fome" por
   **"não iniciar o banho nem no início da fome"** (no RN a fome evolui
   rapidamente para choro/desorganização).
3. **Retirar indicação de pediatra** da resposta principal — queixa restrita
   ao banho, sem sinais clínicos.
4. **Material provisório**: "Passo 1: Prepare o Ambiente" é aceitável, mas
   idealmente criar/indicar conteúdo específico sobre **banho do RN, contenção
   corporal e adaptação ao banho**.

### 3.2 RN 16d — sonda + mama bem (prioridade baixa)

1. **Não normalizar** a abertura. Se há complemento com sonda + busca <2h,
   conduzir imediatamente para produção, suporte alimentar e saciedade — não
   dizer "é esperado que o bebê busque o peito frequentemente".
2. **Eliminar redundância** de fraseologia: usar apenas "baixa produção
   materna ou necessidade de suporte de produção" (não repetir "ou menor
   produção materna").
3. **Consistência de gênero**: substituir "ele continua" → "ela continua" e
   "se ele mama" → "se ela mama".
4. **Evitar repetição de blocos** de orientações.

### 3.3 RN 19d — travesseiro / berço (prioridade baixa/média)

1. **Remover frase truncada / colada** logo após a lista de aulas:
   > "As aulas que podem te ajudar são: ... 'Mamadas Efetivas'.Após a mamada,
   > depois de arrotar e de ser mantida em posição vertical antes de
   > transferir para o berço."
   Substituir por:
   > "As aulas que podem te ajudar são: Estratégia do Travesseiro, Berço do
   > Bebê, Estimule o Arroto e Mamadas Efetivas. Após a mamada, mantenha a
   > bebê em posição vertical por 30 a 40 minutos, observe se ela arrotou e
   > só então tente a transferência para o berço."
2. **Corrigir explicação repetitiva dos sinais de saciedade**:
   > "permanece mais confortável depois do arroto e da depois de arrotar e de
   > ser mantida em posição vertical."
   Substituir por:
   > "permanece mais confortável depois do arroto e após ser mantida em
   > posição vertical por 30 a 40 minutos."
3. **Recuperar formulação forte sobre sonecas iniciais**:
   > "Nos primeiros dias, muitas sonecas podem acontecer com a bebê no
   > travesseiro em cima do colo, com contenção das mãos enquanto necessário."
4. **Sequência prática canônica**: mamada efetiva → sinais de saciedade →
   arroto → vertical 30–40 min → ambiente escuro/calmo → charutinho se
   Moro/desorganização → travesseiro no colo com contenção → transferência
   gradual ao berço.
5. **Orientação de arroto mais direta**: "Após a mamada, coloque para arrotar
   e observe se ela fica mais confortável depois do arroto." (em vez de
   "observe se há necessidade de arroto").
6. **Incluir "Charutinho e os Reflexos de Moro" na lista textual de aulas**,
   não apenas no card, sempre que a resposta orientar charutinho.

## 4. Regras metodológicas a codificar

IDs sugeridos para `src/knowledge/rn/rules.json`, seguindo a convenção já
usada em `rn-teste009-*`.

### RN 13d — banho

| ID sugerido | Regra |
| --- | --- |
| `rn-teste010-banho-barriguinha-como-acao-central` | Iniciar banho com bebê de nariz/barriguinha para baixo apoiado no braço deve ser a ação inicial, não alternativa. |
| `rn-teste010-banho-nao-iniciar-no-inicio-da-fome` | Não iniciar banho no início da fome; a fome no RN evolui rapidamente para choro/desorganização. |
| `rn-teste010-banho-nao-indicar-pediatra` | Queixa restrita ao banho sem sinais clínicos → não indicar pediatra na resposta principal. |
| `rn-teste010-banho-material-provisorio-passo1` | "Passo 1: Prepare o Ambiente" é apoio provisório; conteúdo específico sobre banho RN é o alvo. |

### RN 16d — sonda / produção

| ID sugerido | Regra |
| --- | --- |
| `rn-teste010-sonda-no-over-normalization-abertura` | Se sonda + busca <2h, a abertura não deve normalizar ("é esperado buscar frequentemente"); conduzir a produção/suporte. |
| `rn-teste010-produção-fraseologia-canonica` | Usar apenas "baixa produção materna ou necessidade de suporte de produção"; remover "ou menor produção materna". |
| `rn-teste010-gender-consistency-16d` | Manter gênero feminino consistente ("ela continua", "se ela mama"). Já coberto parcialmente por `enforceGenderConsistency`. |
| `rn-teste010-dedupe-blocos-orientacao` | Não repetir blocos inteiros de orientações (arroto/vertical/ambiente) dentro da mesma resposta. |

### RN 19d — travesseiro / berço

| ID sugerido | Regra |
| --- | --- |
| `rn-teste010-travesseiro-lista-fecha-com-frase-completa` | Após lista de aulas, garantir espaço + frase completa ("Após a mamada, mantenha a bebê em posição vertical por 30 a 40 minutos..."). |
| `rn-teste010-travesseiro-satiety-back-reference-fix` | Reescrever "depois do arroto e da depois de arrotar e de ser mantida em posição vertical" → "depois do arroto e após ser mantida em posição vertical por 30 a 40 minutos". |
| `rn-teste010-travesseiro-sonecas-no-colo-nos-primeiros-dias` | Recuperar frase forte: "muitas sonecas podem acontecer com a bebê no travesseiro em cima do colo, com contenção das mãos". |
| `rn-teste010-travesseiro-sequencia-canonica` | Sequência: mamada efetiva → saciedade → arroto → vertical 30–40 → ambiente → charutinho → travesseiro no colo → transferência gradual. |
| `rn-teste010-travesseiro-arroto-orientacao-direta` | Substituir "observe se há necessidade de arroto" por "coloque para arrotar e observe se ela fica mais confortável depois do arroto". |
| `rn-teste010-travesseiro-charutinho-lista-textual` | Incluir "Charutinho e os Reflexos de Moro" na lista textual quando a resposta orientar charutinho. |

## 5. Sinais / travas a preservar do Teste 009 (não regredir)

- `rn-teste009-ictericia-linguinha-historical-only` (16d)
- `rn-teste009-sonda-busca-investigate-production` (16d)
- `rn-teste009-production-over-transfer-sonda` (16d)
- `rn-teste009-deficit-also-during-day` (16d)
- `rn-teste009-complement-evaluate-day-and-afternoon` (16d)
- `rn-teste009-ordenhas-day-and-afternoon` (16d)
- `rn-teste009-travesseiro-reframing-contextual` (19d)
- `rn-teste009-travesseiro-satiety-and-insufficient-conduct` (19d)
- `rn-teste009-no-generic-human-support-travesseiro` (19d)

O `simulateTeste010Features.js` (quando existir) deve **executar antes** as
verificações do 009 para garantir não-regressão, seguindo o padrão do
`simulateTeste009Features.js`.

## 6. Formulações ideais por caso

### RN 13d — banho (eixo central)

> "Na prática, duas medidas costumam resolver melhor: começar o banho com o
> bebê de nariz/barriguinha para baixo, apoiado com segurança no braço, e não
> iniciar o banho nem no início da fome. Depois disso, usar fralda de pano,
> corpo mais submerso, ambiente aquecido, banho curto e
> repetição/previsibilidade."

### RN 16d — sonda / produção

> "Pelo padrão que você descreve, com busca pelo peito em intervalo menor que
> 2h começando no final da tarde e piorando na madrugada, a principal hipótese
> é baixa produção materna ou necessidade de suporte de produção nesse
> período, especialmente porque sua bebê já recebe complemento com sonda. Esse
> déficit pode ocorrer também durante o dia. Por isso, é importante avaliar se
> o complemento também precisa ser ajustado no final da tarde e durante o dia,
> além de considerar ordenhas como apoio à produção. Como você informou que
> agora ela mama bem, icterícia e procedimento na linguinha ficam apenas como
> histórico, não como causa atual."

### RN 19d — travesseiro / berço

> "Olá, mãe. Com 19 dias, sua bebê ainda está em fase de adaptação
> fisiológica, organização corporal e transição do colo para a superfície do
> berço. Isso não significa vício, manha, mau hábito ou associação negativa.
>
> Como você já tentou a Estratégia do Travesseiro, recomendo que assista ou
> reassista à aula e repita o processo exatamente como ensinado. Nos primeiros
> dias, muitas sonecas podem acontecer com a bebê no travesseiro em cima do
> seu colo, com sua mão fazendo a contenção enquanto necessário. Essa etapa
> faz parte do processo, não é uma falha, e ajuda a bebê a se organizar para a
> transferência gradual ao berço.
>
> Antes de focar apenas no berço, observe a alimentação: você percebe queda no
> fluxo de leite no fim da tarde ou começo da noite? Depois de mamar, ela
> solta o peito espontaneamente, relaxa o corpo, abre as mãozinhas e permanece
> tranquila, ou volta a buscar o peito pouco tempo depois?
>
> Após a mamada, coloque para arrotar e mantenha a bebê em posição vertical
> por 30 a 40 minutos. O ambiente deve estar escuro, calmo e com baixa
> estimulação. Se houver reflexo de Moro ou desorganização corporal, use o
> charutinho também nas sonecas diurnas.
>
> Se ela continuar agitada, com mãozinhas cerradas e buscando o peito ou a
> oferta novamente em pouco tempo, isso pode indicar que a mamada não foi
> suficiente ou que houve dificuldade de transferência. Se mama no peito,
> ofereça novamente em livre demanda. Se usa fórmula ou complemento, avalie
> volume, intervalo e sinais de saciedade conforme orientação individual. Em
> qualquer caso, reavalie produção/transferência no período."

## 7. Próximos passos técnicos sugeridos

Seguindo o padrão dos testes anteriores:

1. **Adicionar regras** em `src/knowledge/rn/rules.json` com os IDs da seção
   4 acima.
2. **Criar/estender funções em `src/services/safetyValidator.js`**, por
   exemplo:
   - `ensureBanhoBarriguinhaCentralAction`
   - `ensureBanhoNoStartAtHungerOnset`
   - `ensureNoPediatraOnPureBathCase`
   - `ensureSondaNoOpeningNormalization`
   - `ensureProducaoCanonicaPhrasing`
   - `ensureNoBlockRepetition`
   - `ensureTravesseiroListClosingSentence`
   - `fixTravesseiroSatietyDoubleBackReference`
   - `ensureTravesseiroSonecasNoColoPhrase`
   - `ensureTravesseiroCanonicalSequence`
   - `ensureTravesseiroDirectArrotoInstruction`
   - `ensureCharutinhoInTextualLessonList`
3. **Criar `src/scripts/simulateTeste010Features.js`** replicando a estrutura
   do `simulateTeste009Features.js` — infra rules present + regressão do 009 +
   três `CASES` (13d/16d/19d) com `enricherMust` / `enricherMustNot`.
4. **Rodar `npm run test:scenarios`** e o novo script para validar
   não-regressão antes de rebuild do índice.

Para executar o passo 1–3 automaticamente, é só pedir para eu implementar as
correções do TESTE 010.
