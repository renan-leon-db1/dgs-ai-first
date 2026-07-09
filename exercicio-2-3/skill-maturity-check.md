# Critérios de Maturidade de Skill — NovaTech Assistant

Documento de referência para avaliar **qualquer skill do projeto** (Foundation, Domain ou Artifact) antes de considerá-la apta para uso pelo time sem supervisão adicional em code review.

As Seções 1 a 5 definem os critérios de forma independente de qualquer skill específica — aplicam-se igualmente a uma skill nova, ainda não testada, e a uma skill já em uso. A Seção 6 traz um exemplo real de aplicação desses critérios (skill `azure-functions-endpoint`, v1 → v2), apresentado **apenas como comparativo** de como preencher o checklist e o registro de versão — não como parte da definição dos critérios.

## 1. O que é uma skill madura

Uma skill madura é aquela que, **testada com o Copilot gerando código real a partir apenas do conteúdo do arquivo `SKILL.md` — sem nenhuma instrução adicional no prompt do usuário —, produz uma implementação em que 100% das regras binárias aplicáveis (excluindo regras não exercitadas pelo cenário testado) são seguidas, de forma reprodutível em pelo menos duas rodadas de teste consecutivas.**

Esta definição é deliberadamente operacional, não aspiracional. Isso significa:

- **"Madura" não é uma opinião subjetiva de quem escreveu a skill.** É um resultado medido comparando uma tabela de regras com o código gerado, linha por linha.
- **Regra que não foi exercitada não conta nem a favor nem contra.** Se o cenário de teste não aciona uma regra (ex: uma regra sobre configuração externa, quando o endpoint testado não usa configuração externa), essa regra fica marcada como pendente de cobertura, não como aprovada por padrão.
- **Uma falha isolada em uma regra binária é suficiente para a skill não ser considerada madura**, independentemente de quantas outras regras foram seguidas corretamente. Não existe "quase maduro" — existe "madura" ou "em iteração". Isso vale para qualquer skill, tenha ela 5 ou 50 regras: uma regra não seguida é sempre um problema concreto e localizável em code review, não um detalhe que se dilui estatisticamente num conjunto maior.
- **Reprodutibilidade importa mais que o resultado de uma única rodada.** Uma skill que passa 100% em uma rodada e regride na próxima não é madura; é instável. A maturidade só é declarada após confirmação em uma segunda rodada sem regressão em relação à anterior.

## 2. Checklist de avaliação

Checklist binário, aplicável a qualquer skill do projeto, independentemente do seu nível (Foundation, Domain ou Artifact) ou do tipo de artefato que ela gera.

### 2.1 Estrutura do documento (avaliação estática, sem precisar rodar o Copilot)

- [ ] A skill tem uma seção de Activation com frase-gatilho objetiva (não vaga o suficiente para gerar dúvida sobre quando aplicar)
- [ ] A skill lista explicitamente quais outras skills (Foundation/Domain) devem ser lidas antes dela
- [ ] Toda regra da seção Rules está no formato **DEVE** / **NÃO DEVE** — nenhuma regra é descrita apenas em prosa livre ou como recomendação ("é preferível", "considere")
- [ ] Cada regra é binária: um revisor consegue marcar "seguida / não seguida" olhando o código, sem precisar interpretar intenção
- [ ] Existe ao menos 1 exemplo de código **DO** completo (não um trecho isolado)
- [ ] Existe ao menos 1 exemplo de código **DON'T** com anti-padrões reais, marcados inline com `❌`
- [ ] Cada anti-padrão documentado tem as três partes: o que é gerado errado, por que está errado, qual a correção
- [ ] Toda regra que já falhou em algum teste anterior tem um exemplo negativo explícito associado — regra em prosa sem contraexemplo (`❌ ERRADO`) tende a ser ignorada pelo Copilot, segundo evidência empírica acumulada no projeto
- [ ] Os exemplos de código DO compilam sem erros sob TypeScript strict mode
- [ ] Os exemplos de código DON'T, se colados isoladamente, seriam rejeitados em code review pelas mesmas regras que a própria skill define — ou seja, o DON'T não é um exemplo "morno", ele viola a regra de forma inequívoca

### 2.2 Validação empírica (avaliação dinâmica, exige rodar o Copilot)

- [ ] A skill foi testada gerando um artefato real, com o Copilot usando **apenas** o `SKILL.md` como contexto — nenhuma instrução adicional no prompt cobrindo regras que a skill deveria cobrir sozinha
- [ ] Existe uma tabela de resultado com todas as regras aplicáveis da skill, cada uma marcada Sim / Não / Parcial (não exercitada)
- [ ] O Copilot seguiu **100% das regras aplicáveis** (excluindo as marcadas Parcial/não exercitada) — ver Seção 3 para o cálculo exato
- [ ] Toda regra marcada "Não seguida" foi investigada e classificada em uma das duas categorias antes de qualquer edição na skill:
  - (a) **Falha real de prescritividade** — a regra existe, mas não é clara/forte o suficiente para o Copilot segui-la;
  - (b) **Falso negativo do critério de teste** — o critério de teste está mal formulado e mede o comportamento errado (ex: um critério que verifica a *presença* de um padrão que a skill na verdade proíbe; nesse caso "Não" é o resultado desejado, e é o critério de teste que deve ser reescrito, não a skill)
- [ ] Toda falha classificada como (a) gerou uma edição versionada e rastreável na skill (nova regra, exemplo corrigido, ou anti-padrão adicionado)
- [ ] Toda falha classificada como (b) gerou uma correção no critério de teste (não na skill), documentada no registro de versão
- [ ] A skill foi re-testada após qualquer edição, e as regras anteriormente marcadas "Não" (categoria a) passaram a "Sim" na rodada seguinte
- [ ] Nenhuma regra que estava "Sim" na rodada anterior regrediu para "Não" na rodada atual

## 3. Threshold de aprovação

- **Mínimo de regras seguidas para considerar a skill "pronta para o time": 100% das regras aplicáveis / 100% das regras aplicáveis.**

Cálculo: `regras aplicáveis = total de regras da tabela de teste − regras marcadas "Parcial (não exercitada)"`. Threshold = `regras com resultado desejado ("Sim") / regras aplicáveis = 100%`.

Não se usa um percentual intermediário (ex: 80% ou 90%) como aceitável, independentemente de quantas regras a skill tenha. Justificativa: cada regra binária representa um comportamento que, se ausente, gera retrabalho real em code review — uma regra não seguida não deixa de ser um problema só porque há outras 10, 30 ou 50 regras que passaram. "Arredondar para cima" uma falha isolada mascararia um defeito que continuaria acontecendo em todo endpoint gerado a partir daquela skill.

Regras marcadas "Parcial (não exercitada)" **não bloqueiam** a aprovação da skill, mas ficam registradas como **dívida de cobertura de teste**: a skill é aprovada com a ressalva de que aquela regra segue sem validação empírica até que um cenário de teste a exercite.

### O que fazer se o threshold não for atingido

1. Para cada regra "Não seguida", classificar como falha real (a) ou falso negativo de critério (b), conforme Seção 2.2.
2. Para falhas reais: editar **apenas** as seções da skill relacionadas (Rules, Code Examples, Anti-patterns) — nunca reescrever o documento inteiro a cada iteração, para preservar o que já funciona e manter o diff revisável.
3. Para falsos negativos: corrigir o critério de teste na tabela de avaliação, sem tocar na skill.
4. Re-testar em um novo cenário equivalente (mesmo tipo de artefato, dados diferentes) para confirmar que a correção resolveu a falha sem quebrar nenhuma regra que já passava.
5. Só declarar a skill madura após uma rodada em 100% sem qualquer regressão em relação à rodada anterior.
6. Se, após 3 iterações, uma mesma regra continuar falhando, escalar para revisão do formato da regra em si — pode ser sintoma de regra mal formulada (ex: regra descrita só em prosa, sem exemplo negativo explícito), e não de o Copilot "não aprender".

## 4. Ciclo de revisão

- **Frequência de revisão programada:** a cada 90 dias, ou a cada 10 novos artefatos criados usando a skill (o que ocorrer primeiro).
- **Eventos que disparam revisão antecipada** (fora do calendário):
  - Mudança de versão major de uma dependência central que a skill assume (ex: runtime, framework, modelo de programação do Azure Functions).
  - Novo padrão de erro, logging, validação ou estrutura de arquivos adotado pelo projeto, que a skill ainda não reflete.
  - Qualquer teste real com o Copilot que resulte em pelo menos 1 regra "Não seguida" classificada como falha real (categoria a da Seção 2.2) — não é preciso esperar o ciclo trimestral.
  - Criação de uma nova skill de nível superior (Artifact, se a skill revisada for Domain) que dependa desta skill e exponha um cenário não coberto pelos exemplos atuais.
  - Feedback de code review humano apontando um desvio de padrão que os testes com Copilot não capturaram.
- **Responsável pela revisão:** o Tech Lead do squad responsável pelo projeto (ou quem ele delegar formalmente). Qualquer desenvolvedor do time pode propor e conduzir o teste empírico (Seção 2.2), mas a aprovação de uma nova versão da skill como "pronta para o time" é sempre do Tech Lead.

## 5. Registro de versão

Template a ser preenchido por skill, a cada iteração:

| Versão da skill | Data | O que mudou | Threshold atingido? |
|---|---|---|---|
| | | | |

## 6. Exemplo comparativo (não normativo)

Esta seção ilustra como os critérios das Seções 1 a 5 foram aplicados a um caso real — a skill `azure-functions-endpoint`, em duas rodadas de teste. Os números, nomes de regras e achados abaixo são específicos dessa skill e **não fazem parte da definição dos critérios**; servem apenas de referência para preencher o checklist e o registro de versão de qualquer outra skill.

### 6.1 Threshold aplicado

| Rodada | Regras aplicáveis | Seguidas | Falhas reais | Atingiu threshold? |
|---|---|---|---|---|
| v1 | 7 (excluída "variáveis de ambiente via config.ts", não exercitada no cenário testado) | 6 | 1 (`catch (error)` sem anotação `: unknown` — regra existia em prosa, mas não era explícita/verificável, e o próprio exemplo DO da skill reforçava o padrão incorreto) | **Não** |
| v2 | 7 (mesma exclusão) | 7 | 0 | **Sim** |

### 6.2 Registro de versão preenchido

| Versão da skill | Data | O que mudou | Threshold atingido? |
|---|---|---|---|
| v1 | 2026-07-09 | Versão inicial da skill `azure-functions-endpoint`, com Required Structure, Rules, Code Examples e Anti-patterns. Testada pela primeira vez com o Copilot em um endpoint real. | **Não** — 6/7 regras aplicáveis seguidas; 1 falha real (`catch` sem anotação de tipo). |
| v2 | 2026-07-09 | Duas edições pontuais em resposta à v1: (1) nova regra explícita exigindo `catch (error: unknown)`, com exemplo DO e tabela de anti-padrões corrigidos; (2) nova regra proibindo arquivos de validação alternativos a `schema.ts`. | **Sim** — 7/7 regras aplicáveis seguidas, 0 falhas reais. Regra de configuração externa permanece como dívida de cobertura. |

### 6.3 Achado de metodologia

Um dos critérios de teste usados nas duas rodadas — "arquivo separado para `validator.ts`" — media a *presença* de um padrão que a própria skill proíbe. Nas duas rodadas o resultado foi "Não", e nas duas isso já era o comportamento desejado (categoria (b) da Seção 2.2: falso negativo do critério, não falha da skill). A lição para outras skills: sempre que um critério de teste for formulado de forma invertida (onde "Não" é o resultado bom), ele deve ser reescrito antes da próxima rodada, para que "Sim" volte a significar "comportamento correto" de forma consistente em toda a tabela.