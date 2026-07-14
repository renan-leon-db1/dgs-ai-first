# Comparação — Avaliação de Risco (Tech Lead) vs. Claude (co-reviewer)

> Objetivo: comparar honestamente a avaliação feita de forma independente pelo Tech Lead ([avaliacao-riscos-IA.md](avaliacao-riscos-IA.md)) com a avaliação feita pelo Claude ([avaliacao-riscos-Claude.md](avaliacao-riscos-Claude.md)), destacando convergências, o que cada lado viu que o outro não viu, e uma assimetria de contexto que explica boa parte da diferença.

## Convergências (onde as duas listas chegaram ao mesmo lugar)

- **Skills**: o Tech Lead já capturou, na versão revisada, a distinção central — Foundation (refinada e testada) vs. Domain/Artifact (nunca testadas com o mesmo rigor) como o risco real, não "IA pode errar" em abstrato. Isso atende ao critério do exercício de identificar as 2 skills sem refinamento como risco.
- **System prompt**: o Tech Lead identificou o núcleo do risco de governança — "pode ser difícil identificar a causa pela falta de registro das alterações". É essencialmente o mesmo argumento de "rollback às cegas" trazido pelo Claude, só que com palavras diferentes. Atende ao critério de risco de governança sem rollback informado.
- **AGENTS.md**: ambos apontam o mesmo mecanismo de risco — decisões antigas contradizendo as novas por causa das múltiplas rodadas de refinamento.

## O que o Claude viu e o Tech Lead não mencionou

- Em **AGENTS.md** e **código Copilot**, a lista do Claude cita evidências concretas do repositório (o `validator.ts` que já viola a própria skill do projeto; os arquivos de spec vazios em `specs/pipeline-ingestao/` e `specs/query-endpoint/`; o `prompt-changelog.md` vazio; a cobertura de 75%/25% descoberta). A lista do Tech Lead permanece no nível de risco genérico de "IA pode gerar código com bugs/vulnerabilidades" — correto, mas sem ancorar em nada específico deste projeto.
- O Claude priorizou explicitamente Domain sobre Artifact (Domain toca código de produção; Artifact toca scaffolding de teste/UI). O Tech Lead tratou as duas skills não refinadas como risco equivalente.
- O Claude conectou os 12% de erro já descobertos em produção como pista de onde investigar primeiro (qual etapa do pipeline, quais dos 25% sem cobertura de teste). A lista do Tech Lead trata a revisão do código como auditoria geral, sem esse recorte.

## O que o Tech Lead viu e o Claude não destacou da mesma forma

- A frase do Tech Lead em AGENTS.md — "regras descritas de maneira genérica, não sendo aplicadas como esperado na prática" — é um ângulo diferente do trazido pelo Claude: aponta o risco de **regras vagas o suficiente para serem mal-interpretadas**, enquanto o Claude apontou o risco de **regras específicas que se contradizem entre si**. São dois riscos distintos e complementares — nenhum invalida o outro, ambos devem permanecer no documento final.

## Por que a diferença de especificidade não é "o Claude raciocinou melhor"

É importante registrar isso com honestidade: a maior especificidade da lista do Claude não vem de superioridade de julgamento, vem de **acesso de leitura ao repositório real** durante a sessão (AGENTS.md inteiro, pastas de skills, specs vazios, changelog vazio, código do endpoint de query). O Tech Lead fez sua avaliação raciocinando sobre o resumo dado no enunciado do exercício, sem necessariamente reabrir cada arquivo do zero antes de escrever.

Isso é, em si, um achado válido para a fase de governança: **um co-reviewer de IA com acesso ao código é mais específico não porque "pensa melhor", mas porque tem contexto que um julgamento humano rápido, feito de memória, não tem.** Na prática, isso significa que a mesma especificidade estaria disponível ao Tech Lead se a leitura dos arquivos reais precedesse a escrita da lista — o gap não é de capacidade, é de tempo/processo investido antes de avaliar.

## Conclusão da comparação

A avaliação do Tech Lead atende 2 dos 4 critérios do exercício de forma sólida (skills e system prompt) com raciocínio próprio e genuíno. Os outros dois (AGENTS.md e código Copilot) estão corretos mas genéricos, por não estarem ancorados em evidência do repositório — a lacuna é de instrumentação/evidência, não de julgamento. A lista do Claude complementa exatamente esses dois pontos, e a lista do Tech Lead complementa a do Claude com o ângulo de "regra vaga" em AGENTS.md, que o Claude não havia considerado. As duas listas juntas cobrem o terreno de risco de forma mais completa do que qualquer uma isolada — o que é o resultado esperado de um processo de co-revisão.
