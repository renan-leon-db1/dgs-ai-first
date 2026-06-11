# ADR-0004: Build vs. Buy para o Pipeline de RAG

## Status: Proposto

## Contexto

O pipeline de RAG da NovaTech exige os seguintes componentes: (1) ingestão e processamento de documentos (PDF, Word, planilhas, OCR para ~15% escaneados), (2) chunking e geração de embeddings, (3) armazenamento e busca vetorial, (4) orquestração da query (retrieval + reranking + prompt assembly), (5) integração com Teams e SharePoint.

Duas abordagens principais foram avaliadas:

**Opção A — Build com frameworks open-source:**
LangChain ou LlamaIndex para orquestração + ChromaDB ou FAISS para vector store + Azure Document Intelligence para OCR + integrações customizadas com Teams/SharePoint via Microsoft Graph API

**Opção B — Buy/Managed com stack Azure nativo:**
Azure AI Search (com capacidade vetorial) + Azure OpenAI + Azure Document Intelligence + Azure Bot Service para Teams + Azure Logic Apps ou Power Automate para trigger de atualização de documentos

Restrições que moldam a decisão:
- Prazo de **3 meses** para discovery + desenvolvimento + go-live
- NovaTech já possui **licenças Azure AI Services** e M365 E3
- Time da DB1 responsável pelo projeto (tamanho não especificado, assumido pequeno/médio)
- Expectativa de atualização documental em até **24h após publicação**
- A NovaTech não tem equipe de MLOps interna para operar infraestrutura complexa

## Decisão

**Adotar o stack Azure nativo (Opção B):** Azure AI Search como vector store + Azure OpenAI (GPT-4o, ver ADR-0001) + Azure Document Intelligence para OCR + Azure Bot Service para canal Teams.

A orquestração da query (prompt assembly, reranking, lógica de conflitos definida em ADR-0003) será implementada em código Python/C# customizado chamando as APIs Azure — **sem dependência de LangChain/LlamaIndex como framework de orquestração** (apenas para utilitários pontuais se necessário).

Justificativa por critério:

| Critério | Build (LangChain + ChromaDB) | Buy (Azure nativo) | Decisão |
|---|---|---|---|
| Custo infra operacional | Variável + GPU para ChromaDB em escala | Incluído em Azure AI Search (S1: ~$250/mês) | Azure |
| Complexidade operacional | Alta (deploy, versioning, monitoring próprios) | Baixa (managed, SLA Microsoft) | Azure |
| Flexibilidade de customização | Alta | Média (APIs abertas, mas sem acesso a internals) | Empate |
| Prazo de entrega (3 meses) | Maior risco de atraso por infra | Menor risco, foco no produto | Azure |
| Integração SharePoint/Teams | Manual via Graph API | Nativa (Azure AI Search tem conector SharePoint) | Azure |
| Atualização 24h de documentos | Requer polling/webhook customizado | Azure AI Search indexer com schedule nativo | Azure |
| Portabilidade futura | Alta (pode migrar a qualquer momento) | Média (vendor lock-in Azure) | Build |
| Custo total estimado (6 meses pós go-live) | ~$400–600/mês (infra) + overhead eng | ~$500–700/mês (managed) | Empate |

O conector nativo do Azure AI Search para SharePoint é o fator de desempate mais significativo: elimina o maior risco de integração do projeto (sincronização com a fonte documental primária) e garante o requisito de atualização em 24h sem desenvolvimento adicional.

## Consequências

**Positivas:**
- Prazo de 3 meses viabilizado: time foca em produto (UX do bot, lógica de conflitos, prompt engineering) em vez de infraestrutura
- Atualização automática de documentos via indexer nativo do Azure AI Search — requisito de 24h atendido sem desenvolvimento customizado
- Operação pós go-live pela NovaTech não requer equipe técnica especializada em MLOps
- Azure AI Search Semantic Ranker nativo melhora qualidade do reranking sem implementação adicional
- Conformidade e segurança gerenciadas pela Microsoft (relevante para dados de compliance)

**Negativas:**
- **Vendor lock-in:** migrar para outro stack no futuro requer re-implementação significativa
- Menor flexibilidade para customizações avançadas de retrieval (ex.: hybrid search com BM25 + vetorial tem configuração limitada vs. código próprio)
- Custo da Azure AI Search escala com o volume de documentos e queries — precisa monitoramento
- Debugging do pipeline é mais difícil quando há problemas internos ao serviço gerenciado (caixa preta parcial)
- Dependência de disponibilidade dos serviços Azure (mitigada por SLA de 99.9%)

## Alternativas Consideradas

**LangChain + ChromaDB/FAISS:**
- Controle total do pipeline, portabilidade máxima, comunidade ativa
- Descartado como stack primário porque: (a) ChromaDB/FAISS em produção requer infraestrutura de persistência, backup e escalabilidade que consome tempo de engenharia incompatível com prazo de 3 meses; (b) a integração com SharePoint teria que ser desenvolvida do zero via Graph API; (c) a NovaTech não tem equipe para operar este stack após o go-live
- LangChain pode ser usado **pontualmente** como biblioteca de utilitários (ex.: document loaders para formatos não suportados nativamente) sem ser o framework de orquestração principal

**LlamaIndex como orquestrador:**
- Excelente abstração para RAG, mais focado que LangChain
- Descartado pelos mesmos motivos operacionais do ChromaDB — a questão não é a qualidade do framework, mas o overhead de infraestrutura e integração em um prazo restrito com cliente sem capacidade MLOps
