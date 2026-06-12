# Exercício 1.3 — Revisão Crítica de uma Proposta de RAG

**Exercício:** Tech Lead — Exercício 1.3  
**Data:** 2026-06-11  
**Autor:** Renan Garcia  

---

## Proposta avaliada

> "Vamos usar Azure AI Search com embeddings do ada-002. Todos os documentos serão indexados num único índice. Chunking fixo de 512 tokens sem overlap. O LLM recebe os 3 chunks mais similares. Usaremos GPT-4o para geração. O pipeline de ingestão roda manualmente quando alguém lembra de atualizar."

---

## Tarefa 1 — Minha Revisão Técnica

### Problema 1 — Pipeline de ingestão manual é um risco operacional crítico

**Trecho problemático:** "roda manualmente quando alguém lembra de atualizar."

O cenário descreve uma documentação atualizada mensalmente por 3 áreas diferentes (Operações, Compliance, Comercial) sem processo unificado de revisão. Depender de alguém "lembrar" de rodar o pipeline significa que o assistente pode estar respondendo com base em documentos desatualizados sem que ninguém perceba.

Na prática, um atendente recebe uma resposta sobre prazo ou valor de frete baseada em uma versão antiga da tabela. O cliente é atendido com a informação errada. Depois do go-live, esse tipo de problema é difícil de rastrear porque a resposta parece confiante e fundamentada.

**Risco:** o assistente se torna uma fonte de desinformação com aparência de autoridade, comprometendo a confiança da equipe na ferramenta e potencialmente causando problemas com clientes.

---

### Problema 2 — Chunking fixo de 512 tokens sem overlap perde contexto nas bordas

**Trecho problemático:** "Chunking fixo de 512 tokens sem overlap."

Quando o texto é dividido em blocos de tamanho fixo sem sobreposição, informações que ficam na fronteira entre dois chunks são fragmentadas. Uma tabela de SLA que começa no final do chunk A e termina no início do chunk B será recuperada de forma incompleta — cada metade sem o contexto da outra.

No contexto da NovaTech, grande parte da documentação inclui tabelas (SLA por tipo de cliente, regras de cálculo de frete, procedimentos numerados). Chunks com tabelas incompletas geram embeddings de baixa qualidade semântica e, consequentemente, recuperação imprecisa.

**Risco:** o assistente recupera chunks aparentemente relevantes pela similaridade semântica, mas com conteúdo incompleto, levando a respostas parciais ou incorretas.

---

### Problema 3 — Retornar apenas 3 chunks pode ser insuficiente para perguntas complexas

**Trecho problemático:** "O LLM recebe os 3 chunks mais similares."

Para perguntas simples e diretas, 3 chunks podem ser suficientes. Mas o cenário descreve atendentes que precisam responder dúvidas que cruzam múltiplas áreas: um cliente pode perguntar algo que envolve regra de devolução + SLA do seu tier + cálculo de frete ao mesmo tempo.

Com apenas 3 chunks no contexto, é provável que informações necessárias para responder perguntas multi-domínio estejam ausentes. O GPT-4o vai ou extrapolar com base no que tem (alucinação) ou declarar que não sabe — sendo que a informação existe na base, só não foi recuperada.

**Risco:** perguntas legítimas dos atendentes ficam sem resposta completa, o que não resolve o problema original e pode aumentar o tempo de atendimento em vez de reduzi-lo.

---

### Problema 4 — Índice único sem metadados mistura versões e áreas sem controle

**Trecho problemático:** "Todos os documentos serão indexados num único índice."

O cenário menciona explicitamente que existem documentos contraditórios entre versões, e que hoje a equipe resolve isso informalmente perguntando para colegas mais experientes. Com todos os documentos num índice único e sem metadados estruturados (área responsável, data de vigência, versão), o sistema não tem como distinguir o documento atual do obsoleto.

Durante a recuperação, os dois podem ser retornados juntos. O LLM recebe versões contraditórias de um mesmo procedimento e precisa decidir qual usar — sem ter como saber qual é a vigente.

**Risco:** o problema de inconsistência que a NovaTech já enfrenta hoje é incorporado ao assistente, só que agora com menos visibilidade. O atendente pode não perceber que recebeu uma resposta baseada em documento desatualizado.

---

*Observação: esses 4 pontos foram identificados na minha primeira leitura da proposta. A revisão com o Claude (Tarefa 2) pode revelar riscos adicionais que escaparam da minha análise inicial.*

---

## Tarefa 2 — Revisão do Claude

**Prompt utilizado:**

> Preciso que você revise uma proposta de arquitetura de RAG feita por um desenvolvedor júnior. Abaixo está o contexto do projeto e a proposta. Identifique todos os problemas técnicos e riscos que você conseguir enxergar.
>
> **Contexto do projeto:** A NovaTech é uma empresa de logística com 1.200 funcionários. Possui ~800 documentos no SharePoint (PDFs e Word), ~400 páginas no Confluence e planilhas de rede atualizadas mensalmente. A equipe de atendimento (45 pessoas) gasta 12 minutos por chamado buscando informações. O volume é de 320 chamados/dia, 60% com consulta a documentação. A documentação é atualizada por 3 áreas sem processo unificado, e existem documentos contraditórios entre versões. A NovaTech tem Microsoft 365 E3 e Azure AI Services disponíveis. Meta: reduzir tempo de busca para menos de 2 minutos.
>
> **Proposta do desenvolvedor:** "Vamos usar Azure AI Search com embeddings do ada-002. Todos os documentos serão indexados num único índice. Chunking fixo de 512 tokens sem overlap. O LLM recebe os 3 chunks mais similares. Usaremos GPT-4o para geração. O pipeline de ingestão roda manualmente quando alguém lembra de atualizar."

**Resposta do Claude:**

---

### 1. Chunking fixo sem overlap é inadequado para documentos mistos

Chunks de 512 tokens com zero overlap quebram contexto em pontos arbitrários. Uma cláusula contratual, um procedimento em etapas ou uma tabela logística pode ser cortada ao meio, gerando chunks que isoladamente não fazem sentido. Sem overlap, a informação na fronteira entre dois chunks some efetivamente. Para PDFs e Word com estrutura variada (tabelas, listas, seções), o chunking deve ser semântico/hierárquico (por parágrafo ou seção) e incluir ao menos 10–15% de overlap.

### 2. Índice único para todas as fontes é um anti-padrão

Misturar SharePoint, Confluence e planilhas num índice único cria ruído na recuperação. Uma busca sobre "prazo de entrega" pode retornar um chunk de uma planilha desatualizada de 2021 com o mesmo score de relevância de uma política vigente. Fontes com naturezas diferentes (documentos normativos, wikis operacionais, dados tabulares) se beneficiam de índices separados com estratégias de recuperação distintas, ou ao menos de campos de metadados ricos (fonte, área, data, versão) usados como filtros.

### 3. Documentos contraditórios não têm tratamento algum

O contexto deixa explícito que existem versões conflitantes entre áreas. A proposta ignora completamente esse risco. O LLM pode receber dois chunks com informações opostas sobre o mesmo procedimento e vai sintetizá-los numa resposta coerente porém incorreta — sem nenhum sinal de alerta para o atendente. É necessário um campo de versão/vigência nos metadados, lógica de deduplicação no pipeline, e idealmente um mecanismo que identifique conflitos e os sinalize na resposta.

### 4. Pipeline de ingestão manual é inaceitável para o caso de uso

Planilhas atualizadas mensalmente e documentação modificada por 3 áreas sem processo unificado exigem ingestão automatizada. Um pipeline "quando alguém lembra" garante que o índice ficará desatualizado cronicamente. A solução mínima é um job agendado com detecção de mudanças (delta sync via Microsoft Graph API para SharePoint/Confluence); a solução adequada inclui webhooks ou event-driven triggers.

### 5. Recuperar apenas 3 chunks é arbitrário e provavelmente insuficiente

Para perguntas que cruzam múltiplos documentos ou requerem contexto composto, 3 chunks top-k raramente capturam tudo que é necessário. O número ideal depende do tipo de pergunta e deve ser configurável. Além disso, similaridade vetorial pura favorece documentos lexicalmente próximos da query — uma abordagem híbrida (BM25 + vetorial, disponível no próprio Azure AI Search) aumenta substancialmente a precisão da recuperação.

### 6. Ausência de reranking após a recuperação

Os 3 chunks mais similares por embedding não são necessariamente os 3 mais relevantes para responder a pergunta. Embeddings capturam similaridade semântica geral, mas um reranker (cross-encoder) avalia a relevância do chunk em relação à query específica. Sem reranking, a qualidade das respostas é limitada pela qualidade do retrieval bruto, especialmente problemático com documentos de domínio especializado em logística.

### 7. Planilhas não são texto — precisam de tratamento especial

Planilhas de rede (com rotas, tarifas, prazos) têm estrutura tabular que embeddings de texto representam muito mal. Uma célula "R$ 12,50" sem o cabeçalho da coluna e o contexto da linha não significa nada. Planilhas precisam de pipeline próprio: conversão linha-a-linha ou por seção com cabeçalhos preservados.

### 8. GPT-4o sem prompt estruturado ou system prompt de domínio

A proposta não menciona nenhuma estratégia de prompting. Para um caso de uso de atendimento logístico, o LLM precisa de instruções explícitas: responder apenas com base nos documentos recuperados, sinalizar quando não encontrar a informação, indicar a fonte da resposta, e não inventar dados (tarifas, prazos, endereços). Sem isso, o modelo vai alucinar com toda a fluência do GPT-4o.

### 9. Nenhuma estratégia de avaliação ou baseline

Como saber se o sistema está funcionando? A proposta não prevê métricas (precisão das respostas, taxa de respostas sem fonte, tempo médio de resolução), nem um conjunto de perguntas de teste, nem comparação com o baseline atual.

### 10. Custo de GPT-4o para 192 chamados/dia com consulta não foi estimado

320 chamados/dia × 60% = ~192 com consulta. Cada chamada envia chunks (potencialmente 1.500 tokens de contexto) + prompt + resposta. A proposta não faz nenhuma estimativa de custo, o que é um risco orçamentário real. Vale avaliar GPT-4o-mini para a maioria dos casos com fallback para GPT-4o quando a complexidade exigir.

### 11. Ausência de controle de acesso e auditoria

O SharePoint com Microsoft 365 E3 provavelmente tem permissões por documento ou área. O índice único sem ACL significa que um atendente pode recuperar documentos que não deveria acessar. Sem log de consultas não há como auditar o que foi respondido em caso de disputa ou erro operacional.

**Classificação de criticidade pelo Claude:**

| Criticidade | Problemas |
|---|---|
| 🔴 Bloqueante | #3 (conflitos), #4 (pipeline manual), #8 (sem guardrails no LLM), #11 (acesso) |
| 🟠 Alta | #1 (chunking), #2 (índice único), #7 (planilhas), #10 (custo) |
| 🟡 Média | #5 (top-k fixo), #6 (sem reranking), #9 (sem avaliação) |

---

## Tarefa 3 — Comparação: Minha revisão vs Claude

### O que ambos identificamos

| Meu problema | Equivalente no Claude | Observação |
|---|---|---|
| Problema 1 — Pipeline manual | #4 — Pipeline manual | Mesma identificação; eu enfatizei o impacto de confiança com o usuário final, o Claude focou na solução técnica (Microsoft Graph API, webhooks) |
| Problema 2 — Chunking sem overlap | #1 — Chunking fixo sem overlap | Mesma identificação; o Claude foi mais preciso ao sugerir chunking semântico/hierárquico e overlap de 10–15% |
| Problema 3 — 3 chunks insuficiente | #5 — Top-k fixo e recuperação vetorial pura | Mesma identificação; o Claude foi além e apontou a necessidade de busca híbrida (BM25 + vetorial) |
| Problema 4 — Índice único sem metadados | #2 + #3 — Índice único e documentos contraditórios | Eu tratei como um problema único; o Claude separou em dois (ruído no retrieval e conflito entre versões) |

### O que o Claude encontrou que eu não vi

- **#6 — Reranking:** Não pensei na camada de reranking após a recuperação. O Claude identificou que embeddings sozinhos não são suficientes para selecionar os chunks mais relevantes para a pergunta específica.
- **#7 — Tratamento de planilhas:** Não considerei que planilhas têm estrutura tabular incompatível com chunking de texto padrão. É um ponto relevante dado que a NovaTech tem planilhas de referência atualizadas mensalmente.
- **#8 — Ausência de guardrails no prompt:** Não mencionei a falta de system prompt e instruções ao LLM. Assumi que isso seria feito, mas a proposta realmente não diz nada sobre isso.
- **#9 — Ausência de métricas e avaliação:** Não pensei em como medir se o sistema está funcionando. O Claude identificou isso como um risco para o projeto inteiro.
- **#10 — Estimativa de custo:** Não calculei o volume de tokens e o impacto orçamentário. O Claude fez o cálculo (320 × 60% = 192 chamados/dia) e apontou o risco de não ter isso estimado.
- **#11 — Controle de acesso (ACL):** Não pensei em segurança e permissões. Para um SharePoint corporativo com Microsoft 365 E3, esse é um ponto crítico — potencialmente bloqueante.

### O que eu vi que o Claude não mencionou explicitamente

- **Impacto de confiança:** Eu enfatizei que um assistente respondendo com dados desatualizados é mais perigoso do que não ter o assistente, porque carrega aparência de autoridade. O Claude identificou o risco técnico, mas não aprofundou o impacto de negócio na confiança da equipe.
- **Contexto de go-live em 3 meses:** Mencionei o risco de rastreabilidade após go-live. O Claude não conectou os problemas à restrição de prazo do projeto.

### Análise honesta

Minha revisão cobriu os 4 pontos mais evidentes da proposta — os problemas que um Tech Lead identifica na primeira leitura. O Claude, além de confirmar minha análise, revelou 6 problemas adicionais que eu não considerou, especialmente os relacionados a segurança (ACL), operações (métricas, custo) e qualidade de retrieval (reranking, tratamento de planilhas).

Isso mostra que minha revisão foi suficiente para identificar o que estava mais errado, mas insuficiente para mapear todos os riscos de produção. O Claude funcionou como um revisor especializado que trouxe profundidade técnica — especialmente nos eixos de segurança e operação que eu ainda não tenho como reflexo natural.

---

## Tarefa 4 — Proposta reescrita

### Proposta original (para referência)

> "Vamos usar Azure AI Search com embeddings do ada-002. Todos os documentos serão indexados num único índice. Chunking fixo de 512 tokens sem overlap. O LLM recebe os 3 chunks mais similares. Usaremos GPT-4o para geração. O pipeline de ingestão roda manualmente quando alguém lembra de atualizar."

---

### Proposta revisada

**Stack principal:** Azure AI Search + Azure OpenAI (ada-002 para embeddings, GPT-4o-mini como modelo padrão com fallback para GPT-4o em perguntas complexas). Mantemos o ecossistema Microsoft para facilitar a integração com Teams e SharePoint existentes.

**Indexação e metadados:**
Cada documento será indexado com metadados obrigatórios: fonte (SharePoint / Confluence / planilha), área responsável (Operações / Compliance / Comercial), data de vigência, versão e status (vigente / substituído). Documentos com versões anteriores do mesmo procedimento serão mantidos no índice com status "substituído" — nunca deletados — para fins de auditoria. O retrieval filtrará por padrão apenas documentos com status "vigente", mas o atendente pode consultar versões anteriores explicitamente.

**Estrutura de índices:**
Dois índices separados: (1) documentos textuais (SharePoint + Confluence) e (2) dados tabulares (planilhas). As planilhas serão convertidas linha-a-linha, preservando cabeçalhos de coluna em cada registro, antes de gerar os embeddings. Isso evita que células sem contexto gerem embeddings sem significado.

**Chunking:**
Chunking semântico por seção/parágrafo para documentos estruturados (Word, Confluence), com fallback para chunking por tamanho (512 tokens) com overlap de 15% para PDFs sem estrutura clara. Documentos com tabelas serão processados preservando a tabela inteira como um chunk único quando o tamanho permitir (até 800 tokens).

**Recuperação:**
Busca híbrida habilitada no Azure AI Search (BM25 + vetorial) para aumentar precisão em consultas com termos específicos de domínio (nomes de procedimentos, códigos de SLA). Top-k configurável por tipo de pergunta: 5 chunks para perguntas simples, até 10 para perguntas que o sistema detectar como multi-domínio. Reranking aplicado sobre os candidatos recuperados antes de enviar ao LLM.

**Documentos contraditórios:**
Quando dois chunks com metadados de vigência conflitantes forem recuperados para a mesma query, o system prompt instrui o LLM a apresentar ambas as versões com indicação de data e alertar o atendente. Um campo `data_vigencia` nos metadados permite que o pipeline identifique isso antes da geração.

**LLM e guardrails:**
System prompt de domínio definindo: (1) responder apenas com base nos documentos recuperados, (2) sempre citar fonte (nome do documento + seção), (3) quando não encontrar resposta, dizer explicitamente e sugerir contato com a área responsável, (4) nunca inventar valores numéricos (prazos, tarifas, distâncias). Guardrail determinístico pós-geração: validação programática que verifica se a resposta contém ao menos uma citação de fonte antes de exibi-la ao atendente.

**Pipeline de ingestão:**
Job agendado diário com delta sync via Microsoft Graph API para SharePoint e Confluence (reindexação apenas de documentos alterados desde a última execução). Planilhas de rede monitoradas por hash de arquivo — reindexação automática quando o arquivo mudar. SLA de atualização: máximo 24h após publicação de novo documento. Alertas configurados para falhas de ingestão.

**Controle de acesso:**
O assistente só indexa documentos da biblioteca de atendimento ao cliente — não toda a base do SharePoint. Logs de consulta armazenados (query + documento citado + timestamp + ID do atendente) por 90 dias para fins de auditoria e resolução de disputas.

**Estimativa de custo:**
~192 consultas/dia com LLM. Estimativa inicial: 1.000 tokens de contexto (chunks) + 300 tokens de prompt + 400 tokens de resposta = ~1.700 tokens/chamada. A maioria das consultas será roteada para GPT-4o-mini; estimativa de custo mensal a validar durante o discovery antes de fechar o budget.

**Métricas de sucesso:**
Antes do go-live: criar conjunto de 50 perguntas representativas com respostas esperadas (golden dataset). Métricas monitoradas em produção: tempo médio de resposta do assistente, taxa de respostas com citação de fonte, taxa de respostas marcadas como "informação não encontrada", e NPS dos atendentes após 30 dias.

