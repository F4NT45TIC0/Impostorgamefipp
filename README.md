# 🕵️‍♂️ IMPOSTOR Online (Impostorgamefipp)

Um jogo web multiplayer em tempo real de blefe, dedução e debate, otimizado para celulares e projetado com uma interface moderna, rápida e livre de "IA slop".

O jogo é ideal para jogar presencialmente em grupo (party game), onde cada jogador usa seu próprio celular de forma gratuita e sem anúncios.

---

## 🎮 Como Funciona o Jogo

1. **Entrar na Sala**: Um jogador clica em **Criar Sala** e compartilha o código de 4 letras com os amigos. Todos entram usando seus celulares.
2. **Configuração**: O Dono da Sala (Host) escolhe o tema das palavras, o tempo de debate e a quantidade de impostores (1 ou mais).
3. **Distribuição**: Quando todos dão "Pronto", a partida começa.
   - **Civis** recebem a palavra secreta (ex: *Pizza*).
   - **Impostores** recebem uma palavra um pouco relacionada (ex: *Hambúrguer*).
   - *A tela possui um escudo de privacidade inteligente (Hold-to-Reveal) para evitar que vizinhos fiquem espiando sua palavra secreta.*
4. **Debate na Vida Real**: Os jogadores começam a descrever suas palavras na vida real em rodadas físicas (fora do celular). O objetivo dos Civis é descobrir quem é o Impostor. O objetivo do Impostor é descobrir a palavra dos Civis e tentar se misturar.
5. **Votação e Debate**: O Host clica em "Iniciar Discussão". Um timer sincronizado de 3 minutos inicia na tela de todos. Os jogadores debatem intensamente e votam em quem acham ser o Impostor!
6. **Fim de Rodada**: A discussão se encerra (ou o Host pula), e todos voltam ao Lobby com a sala pronta para configurar uma nova rodada!

---

## 🚀 Como Executar Localmente

### Pré-requisitos
Instale o **Node.js** (versão 16 ou superior) em sua máquina.

### Passos
1. Clone este repositório ou vá para a pasta do projeto.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Compile o Frontend (React) e inicie o servidor Express integrado:
   ```bash
   npm run build
   npm start
   ```
4. Abra `http://localhost:3000` em múltiplos navegadores/abas ou em celulares conectados na mesma rede Wi-Fi para testar!

*(Durante o desenvolvimento, você também pode rodar `npm run dev` para o frontend React com hot reload e rodar `node server.js` no backend separadamente).*

---

## 🌍 Como Publicar de Graça na Internet (Render.com)

Para que você e seus amigos joguem de qualquer lugar do mundo gratuitamente, siga os passos abaixo para hospedar a aplicação no **Render**:

1. Crie uma conta gratuita em [Render.com](https://render.com).
2. Conecte sua conta do GitHub ou GitLab.
3. Clique em **New +** e selecione **Web Service**.
4. Conecte o repositório do seu jogo (`Impostorgamefipp`).
5. Configure os campos exatos como listado abaixo:
   - **Name**: `impostor-game` (ou o nome que preferir)
   - **Region**: Selecione a mais próxima (ex: *Ohio* ou *Frankfurt*)
   - **Branch**: `main` (ou sua branch principal)
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`
6. Clique em **Deploy Web Service** no final da página.

Pronto! Em poucos minutos o Render criará sua aplicação e fornecerá uma URL pública gratuita (ex: `https://impostor-game.onrender.com`). Compartilhe com os amigos e divirtam-se! 🕵️‍♂️🔥
