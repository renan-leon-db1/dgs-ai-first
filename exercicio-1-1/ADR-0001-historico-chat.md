User: Você é um revisor técnico atuando como devil’s advocate para ADRs de arquitetura de IA generativa em contexto empresarial.
Objetivo: criticar decisões, expor riscos ocultos, premissas frágeis, lacunas de governança e trade-offs mal calibrados.

Regras:
- Seja duro com a decisão, mas técnico e objetivo.
- Foque em risco real de produção: custo, latência, confiabilidade, compliance, operação.
- Se apontar problema, sugira alternativa viável.
- Não reescreva tudo; destaque o que deve ser corrigido.

Formato da resposta:
1. Críticas principais, priorizadas por severidade
2. Premissas questionáveis
3. O que está faltando na ADR
4. Como fortalecer a decisão sem trocar totalmente a direção
5. Nota de robustez de 0 a 10, com justificativa

Analise a ADR como devil’s advocate.

Contexto:
- Projeto em Azure/Microsoft
- Prazo de 3 meses
- Assistente com RAG para atendimento
- Requisitos: citar fonte, tratar contradições, atualização em até 24h, evitar invenção

Tarefas:
1. Liste os 5 contra-argumentos mais fortes
2. Classifique cada ponto como bloqueador para produção ou melhoria recomendada
3. Proponha ajustes concretos de texto na ADR (trechos que devo acrescentar ou modificar)
4. Dê uma nota de robustez da ADR de 0 a 10 com justificativa

GitHub Copilot: Semantic workspace search is not currently available

Vou fazer uma revisão adversarial focada em produção e governança, priorizando riscos de custo, latência, confiabilidade, compliance e operação. Em seguida trago 5 contra-argumentos fortes com classificação (bloqueador vs melhoria) e propostas de trechos concretos para inserir/alterar na ADR.

1. **Críticas principais (priorizadas por severidade)**

1. **Ausência de SLOs/SLAs operacionais torna a decisão não verificável**
Classificação: **Bloqueador para produção**  
Problema: a ADR diz “confiabilidade crítica” e “não inventar”, mas não define métricas aceitas em produção (groundedness, taxa de citação válida, latência p95, erro por tipo). Sem critérios mensuráveis, você não consegue aprovar go-live nem operar com segurança.  
Alternativa viável: definir um bloco de **SLOs mínimos** e critérios de rollout/cutoff por métrica.

2. **Custos subestimados por foco excessivo em token do LLM**
Classificação: **Bloqueador para produção**  
Problema: o cálculo de ~$255/mês ignora custos relevantes: Azure AI Search, embeddings/reindexação, storage, observabilidade, retries, ambiente de homolog/prod, picos e reprocessamentos. O risco é estourar orçamento e perder previsibilidade em 3 meses.  
Alternativa viável: adotar **TCO completo** com faixas (base/pico) e gatilhos de contenção (rate limit, fallback, cache, truncamento adaptativo).

3. **“128k resolve truncamento” é premissa perigosa e cara**
Classificação: **Melhoria recomendada (quase bloqueador em escala)**  
Problema: janela longa não substitui boa recuperação; pode aumentar custo e latência sem melhorar factualidade. RAG ruim com contexto grande continua errando, só mais caro.  
Alternativa viável: política de contexto por orçamento de tokens (top-k dinâmico, rerank, compressão de chunks, limite de histórico por sessão).

4. **Compliance/LGPD tratada de forma superficial**
Classificação: **Bloqueador para produção**  
Problema: “dados no Azure” não garante conformidade. Faltam: classificação de dados, política de retenção, mascaramento de PII, auditoria, controles de acesso por papel, registro legal da transferência e uso para inferência.  
Alternativa viável: seção explícita de **controles de privacidade e segurança** com responsáveis e evidências de auditoria.

5. **Falta de estratégia para contradições e atualização em 24h**
Classificação: **Bloqueador para produção**  
Problema: requisito de negócio exige tratar contradições entre fontes e atualização em até 24h, mas a ADR não define pipeline de ingestão, versionamento, invalidação de índice e comportamento quando fontes divergem.  
Alternativa viável: estabelecer **política de resolução de conflito documental** e **SLA de indexação** com monitoramento e fallback (“não há base suficiente”).

---

2. **Premissas questionáveis**

1. “GPT-4o demonstra grounding robusto” sem benchmark interno e sem baseline por domínio da empresa.
2. “SLA Microsoft reduz risco operacional” sem considerar risco de quota/rate-limit/indisponibilidade regional.
3. “Integração nativa Azure = menor risco” sem plano de lock-in e sem estratégia de portabilidade.
4. “Custo previsível” sem modelar sazonalidade e impacto de prompts longos/histórico.
5. “Não alucinar via system prompt” como mecanismo primário; isso é insuficiente sem guardrails e validação pós-resposta.

---

3. **O que está faltando na ADR**

1. **Métricas de aceite para produção**: groundedness, citação correta, resposta “sem evidência”, latência p95/p99, erro por categoria.
2. **Plano de testes e validação**: conjunto de casos reais, adversariais, regressão semanal, critérios de aprovação.
3. **Arquitetura de fallback**: modelo alternativo (ex.: GPT-4o mini) para triagem/baixa complexidade, degrade gracioso, circuit breaker.
4. **Governança de conteúdo**: versionamento de documentos, política de precedência entre fontes, trilha de auditoria por resposta.
5. **Runbook operacional**: incidentes, escalonamento, on-call, monitoramento, orçamento e alertas de custo.
6. **Política de atualização em 24h**: ingestão, validação, indexação, verificação pós-indexação.
7. **Riscos residuais e plano de mitigação**: não só listar negativos, mas indicar dono, prazo e controle.

---

4. **Como fortalecer a decisão sem trocar totalmente a direção**

1. **Manter GPT-4o como primário**, mas definir arquitetura em duas camadas:
- Camada 1: roteamento/classificação + consultas simples em modelo mais barato.
- Camada 2: GPT-4o para casos de alta ambiguidade, multi-documento ou alto risco.

2. **Adicionar guardrails de groundedness**
- Responder apenas com evidência citada.
- Se não houver evidência suficiente: resposta de abstinência padronizada.
- Verificação automática de citação (ID do chunk e versão do documento).

3. **Formalizar SLOs de produção**
- Exemplo: groundedness >= 98%, citação válida >= 99%, latência p95 <= 4s, atualização documental <= 24h em 99% dos casos.

4. **Criar política de contradição**
- Regra de precedência por fonte/versão/data.
- Quando houver conflito sem precedência: sinalizar conflito ao usuário e pedir validação humana.

5. **Fechar TCO com bandas e gatilhos**
- Cenários base/pico.
- Alertas de custo.
- Limites automáticos por tenant/usuário e fallback quando ultrapassar orçamento.

---

5. **Ajustes concretos de texto na ADR (acrescentar/modificar)**

**A. Acrescentar seção “Critérios de Aceite para Produção”**
```markdown
## Critérios de Aceite para Produção (Go/No-Go)

A entrada em produção dependerá do atendimento dos seguintes SLOs por 2 semanas consecutivas em ambiente piloto:

- Groundedness (resposta suportada por evidência recuperada): >= 98%
- Citação válida de fonte (documento + seção/chunk + versão): >= 99%
- Taxa de abstinência correta ("evidência insuficiente"): >= 95%
- Latência fim-a-fim p95: <= 4s; p99 <= 7s
- Atualização de conteúdo no índice após publicação oficial: <= 24h em 99% dos casos
```

**B. Acrescentar seção “Política de Contradição entre Fontes”**
```markdown
## Política de Contradição entre Fontes

Quando houver divergência entre documentos recuperados, o assistente deve:

1. Aplicar precedência por (a) política oficial, (b) documento mais recente, (c) fonte proprietária sobre fonte derivada.
2. Explicitar o conflito na resposta e citar ambas as fontes.
3. Na ausência de regra de precedência, retornar resposta de incerteza e encaminhar para validação humana.
```

**C. Modificar trecho da decisão sobre “não alucinação via system prompt”**
Substituir ideia atual por:
```markdown
O controle de não-alucinação não dependerá apenas de system prompt. Será implementado com guardrails de groundedness, validação de citação por chunk e política de abstinência quando não houver evidência suficiente.
```

**D. Acrescentar seção “Custos e Limites Operacionais (TCO)”**
```markdown
## Custos e Limites Operacionais (TCO)

Além de tokens do LLM, o TCO incluirá Azure AI Search, embeddings, armazenamento, observabilidade, retries e ambientes de teste.
Serão mantidos dois cenários: Base e Pico, com gatilhos automáticos:

- Alerta amarelo: 70% do orçamento mensal
- Alerta vermelho: 90% do orçamento mensal
- Ação de contenção: redução de top-k, compressão de contexto e roteamento para modelo de menor custo em consultas simples
```

**E. Acrescentar seção “Risco de Lock-in e Estratégia de Portabilidade”**
```markdown
## Risco de Lock-in e Estratégia de Portabilidade

Embora Azure OpenAI seja a escolha primária, o desenho do pipeline será vendor-agnostic no nível de orquestração:
- Interface de provedor de modelo desacoplada
- Prompts e avaliações versionados externamente
- Teste trimestral de portabilidade para provedor alternativo
```

---

6. **Nota de robustez (0 a 10)**

**Nota: 5.5/10**

Justificativa: a ADR acerta na direção estratégica (fit com ecossistema Azure e prazo), mas está fraca em pontos que quebram produção: critérios mensuráveis de qualidade, governança de contradição, SLA real de atualização em 24h, TCO completo e controles de compliance auditáveis. A decisão é defensável, porém ainda não está pronta para aprovação de produção sem os reforços acima.

User: ADR-0001 revisada e atualizada com base nos seus pontos.
Faça uma segunda rodada curta de devil’s advocate.

Tarefas:
1. Aponte até 3 riscos residuais mais críticos
2. Diga se ainda há algum bloqueador de produção
3. Dê nota final de robustez de 0 a 10

GitHub Copilot: 1. Riscos residuais mais críticos (até 3)
1. Dependência de qualidade de recuperação ainda subespecificada: há SLO de groundedness, mas falta meta explícita de recall@k/nDCG no retriever e critério mínimo de cobertura por domínio documental. Sem isso, o modelo pode “abster” corretamente, mas o sistema continuar falhando por má recuperação.
2. Operação de atualização em 24h sem desenho de capacidade e backlog: o requisito foi incluído, porém ainda falta plano de throughput de ingestão (picos), reprocessamento incremental, e tempo de recuperação após falha de indexação. Risco de violar SLA em eventos de carga real.
3. Risco regulatório de PII no ciclo de observabilidade: TCO e governança melhoraram, mas ainda não está explícito como logs, traces e prompts/respostas serão minimizados/mascarados e por quanto tempo retidos. Em produção, esse é ponto clássico de não conformidade.

2. Ainda há bloqueador de produção?
Sim, 1 bloqueador potencial permanece: ausência de critérios técnicos mínimos do retriever como gate de go-live (ex.: recall@k por conjunto de validação e por domínio).  
Sem esse gate, os SLOs de resposta podem mascarar causa-raiz e comprometer confiabilidade operacional do RAG.

3. Nota final de robustez (0 a 10)
7.8/10

Justificativa curta: a ADR evoluiu bastante e agora está próxima de um padrão de produção, com SLOs, política de contradição, TCO e lock-in tratados. O principal gap remanescente é transformar qualidade de recuperação e governança de dados observáveis em critérios auditáveis de aprovação operacional.