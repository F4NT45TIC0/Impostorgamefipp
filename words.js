// Banco de dados de palavras para o jogo IMPOSTOR.
// Cada categoria possui pares de palavras relacionadas para que o impostor possa blefar sutilmente.

export const wordCategories = {
  "Frutas": [
    { civilian: "Maçã", impostor: "Banana" },
    { civilian: "Laranja", impostor: "Morango" },
    { civilian: "Uva", impostor: "Melancia" },
    { civilian: "Abacaxi", impostor: "Manga" },
    { civilian: "Pêssego", impostor: "Cereja" },
    { civilian: "Limão", impostor: "Kiwi" },
    { civilian: "Mamão", impostor: "Coco" },
    { civilian: "Abacate", impostor: "Mirtilo" },
    { civilian: "Framboesa", impostor: "Amora" },
    { civilian: "Ameixa", impostor: "Pera" }
  ],
  "Animais": [
    { civilian: "Leão", impostor: "Tigre" },
    { civilian: "Elefante", impostor: "Girafa" },
    { civilian: "Zebra", impostor: "Macaco" },
    { civilian: "Panda", impostor: "Coala" },
    { civilian: "Canguru", impostor: "Pinguim" },
    { civilian: "Golfinho", impostor: "Baleia" },
    { civilian: "Águia", impostor: "Coruja" },
    { civilian: "Papagaio", impostor: "Borboleta" },
    { civilian: "Jacaré", impostor: "Hipopótamo" },
    { civilian: "Rinoceronte", impostor: "Guepardo" },
    { civilian: "Gorila", impostor: "Urso" },
    { civilian: "Lobo", impostor: "Raposa" },
    { civilian: "Veado", impostor: "Canguru" }
  ],
  "Esportes": [
    { civilian: "Futebol", impostor: "Basquete" },
    { civilian: "Tênis", impostor: "Beisebol" },
    { civilian: "Vôlei", impostor: "Hóquei" },
    { civilian: "Golfe", impostor: "Natação" },
    { civilian: "Corrida", impostor: "Ciclismo" },
    { civilian: "Boxe", impostor: "Luta" },
    { civilian: "Surfe", impostor: "Esqui" },
    { civilian: "Vôlei de praia", impostor: "Críquete" },
    { civilian: "Rúgbi", impostor: "Badminton" },
    { civilian: "Arco e flecha", impostor: "Esgrima" },
    { civilian: "Maratona", impostor: "Goleiro" },
    { civilian: "Estádio", impostor: "Campeonato" },
    { civilian: "Torneio", impostor: "Futebol" }
  ],
  "Cinema e Filmes": [
    { civilian: "Avatar", impostor: "Titanic" },
    { civilian: "A Origem", impostor: "Vingadores" },
    { civilian: "Matrix", impostor: "Gladiador" },
    { civilian: "Tubarão", impostor: "Rocky" },
    { civilian: "Frozen", impostor: "Shrek" },
    { civilian: "Coringa", impostor: "Batman" },
    { civilian: "Superman", impostor: "Homem-Aranha" },
    { civilian: "Star Wars", impostor: "Harry Potter" },
    { civilian: "Jurassic Park", impostor: "O Exterminador do Futuro" },
    { civilian: "Predador", impostor: "Alien" },
    { civilian: "Indiana Jones", impostor: "Godzilla" },
    { civilian: "Transformers", impostor: "Piratas do Caribe" },
    { civilian: "Mulher-Maravilha", impostor: "Avatar" }
  ],
  "Tecnologia": [
    { civilian: "Computador", impostor: "Smartphone" },
    { civilian: "Tablet", impostor: "Notebook" },
    { civilian: "Internet", impostor: "WiFi" },
    { civilian: "Bluetooth", impostor: "Câmera" },
    { civilian: "Televisão", impostor: "Rádio" },
    { civilian: "GPS", impostor: "Drone" },
    { civilian: "Robô", impostor: "Inteligência Artificial" },
    { civilian: "Realidade Virtual", impostor: "Computação em Nuvem" },
    { civilian: "Banco de Dados", impostor: "Algoritmo" },
    { civilian: "Rede", impostor: "Servidor" },
    { civilian: "Software", impostor: "Hardware" },
    { civilian: "Processador", impostor: "Memória" },
    { civilian: "Teclado", impostor: "Computador" }
  ],
  "Música e Instrumentos": [
    { civilian: "Violão", impostor: "Piano" },
    { civilian: "Bateria", impostor: "Violino" },
    { civilian: "Saxofone", impostor: "Trompete" },
    { civilian: "Flauta", impostor: "Harpa" },
    { civilian: "Acordeão", impostor: "Gaita" },
    { civilian: "Jazz", impostor: "Rock" },
    { civilian: "Pop", impostor: "Clássica" },
    { civilian: "Blues", impostor: "Ópera" },
    { civilian: "Sinfonia", impostor: "Concerto" },
    { civilian: "Orquestra", impostor: "Banda" },
    { civilian: "Melodia", impostor: "Ritmo" },
    { civilian: "Harmonia", impostor: "Compositor" },
    { civilian: "Maestro", impostor: "Violão" }
  ],
  "Matérias e Ciências": [
    { civilian: "Matemática", impostor: "Ciências" },
    { civilian: "História", impostor: "Geografia" },
    { civilian: "Literatura", impostor: "Biologia" },
    { civilian: "Química", impostor: "Física" },
    { civilian: "Arte", impostor: "Música" },
    { civilian: "Filosofia", impostor: "Psicologia" },
    { civilian: "Economia", impostor: "Sociologia" },
    { civilian: "Astronomia", impostor: "Geologia" },
    { civilian: "Botânica", impostor: "Zoologia" },
    { civilian: "Álgebra", impostor: "Geometria" },
    { civilian: "Gramática", impostor: "Vocabulário" },
    { civilian: "Enciclopédia", impostor: "Laboratório" },
    { civilian: "Livro didático", impostor: "Matemática" }
  ],
  "Jogos Eletrônicos": [
    { civilian: "Minecraft", impostor: "Fortnite" },
    { civilian: "Roblox", impostor: "Among Us" },
    { civilian: "League of Legends", impostor: "Call of Duty" },
    { civilian: "FIFA", impostor: "Pokémon" },
    { civilian: "Mario", impostor: "Zelda" },
    { civilian: "Sonic", impostor: "Pac-Man" },
    { civilian: "Tetris", impostor: "Street Fighter" },
    { civilian: "Mortal Kombat", impostor: "Xbox" },
    { civilian: "PlayStation", impostor: "Nintendo" },
    { civilian: "Controle", impostor: "Joystick" },
    { civilian: "Subir de nível", impostor: "Batalha de chefe" },
    { civilian: "Power-up", impostor: "Pontuação alta" },
    { civilian: "Multijogador", impostor: "Minecraft" }
  ],
  "Futebol Brasileiro": [
    { civilian: "Flamengo", impostor: "Corinthians" },
    { civilian: "Palmeiras", impostor: "São Paulo" },
    { civilian: "Santos", impostor: "Grêmio" },
    { civilian: "Cruzeiro", impostor: "Atlético Mineiro" },
    { civilian: "Vasco", impostor: "Botafogo" },
    { civilian: "Pelé", impostor: "Neymar" },
    { civilian: "Ronaldo", impostor: "Ronaldinho" },
    { civilian: "Romário", impostor: "Zico" },
    { civilian: "Rivaldo", impostor: "Kaká" },
    { civilian: "Cafu", impostor: "Roberto Carlos" },
    { civilian: "Seleção Brasileira", impostor: "Copa do Mundo" },
    { civilian: "Maracanã", impostor: "Brasileirão" },
    { civilian: "Libertadores", impostor: "Flamengo" }
  ],
  "Comidas Brasileiras": [
    { civilian: "Feijoada", impostor: "Brigadeiro" },
    { civilian: "Pão de Queijo", impostor: "Açaí" },
    { civilian: "Coxinha", impostor: "Pastel" },
    { civilian: "Tapioca", impostor: "Moqueca" },
    { civilian: "Acarajé", impostor: "Vatapá" },
    { civilian: "Churrasco", impostor: "Picanha" },
    { civilian: "Farofa", impostor: "Caipirinha" },
    { civilian: "Guaraná", impostor: "Quindim" },
    { civilian: "Pudim", impostor: "Mandioca" },
    { civilian: "Arroz e Feijão", impostor: "Picanha" },
    { civilian: "Pamonha", impostor: "Curau" },
    { civilian: "Canjica", impostor: "Pé de Moleque" },
    { civilian: "Cocada", impostor: "Feijoada" }
  ],
  "Carnaval": [
    { civilian: "Carnaval", impostor: "Samba" },
    { civilian: "Blocos", impostor: "Escola de Samba" },
    { civilian: "Sapucaí", impostor: "Passista" },
    { civilian: "Bateria", impostor: "Pandeiro" },
    { civilian: "Surdo", impostor: "Tamborim" },
    { civilian: "Cavaquinho", impostor: "Fantasia" },
    { civilian: "Alegoria", impostor: "Trio Elétrico" },
    { civilian: "Frevo", impostor: "Axé" },
    { civilian: "Marchinha", impostor: "Avenida" },
    { civilian: "Desfile", impostor: "Mestre-sala" },
    { civilian: "Porta-bandeira", impostor: "Comissão de frente" },
    { civilian: "Enredo", impostor: "Sambódromo" },
    { civilian: "Baiana", impostor: "Carnaval" }
  ],
  "Praias do Brasil": [
    { civilian: "Copacabana", impostor: "Ipanema" },
    { civilian: "Leblon", impostor: "Barra da Tijuca" },
    { civilian: "Praia do Rosa", impostor: "Fernando de Noronha" },
    { civilian: "Jericoacoara", impostor: "Porto de Galinhas" },
    { civilian: "Maragogi", impostor: "Búzios" },
    { civilian: "Ilha Grande", impostor: "Trancoso" },
    { civilian: "Morro de São Paulo", impostor: "Praia do Forte" },
    { civilian: "Guarujá", impostor: "Ilhabela" },
    { civilian: "Florianópolis", impostor: "Balneário Camboriú" },
    { civilian: "Bombinhas", impostor: "Arraial do Cabo" },
    { civilian: "Cabo Frio", impostor: "Ubatuba" },
    { civilian: "Paraty", impostor: "Angra dos Reis" },
    { civilian: "Praia dos Carneiros", impostor: "Copacabana" }
  ],
  "Música Brasileira": [
    { civilian: "Samba", impostor: "Bossa Nova" },
    { civilian: "MPB", impostor: "Forró" },
    { civilian: "Sertanejo", impostor: "Axé" },
    { civilian: "Funk Carioca", impostor: "Caetano Veloso" },
    { civilian: "Gilberto Gil", impostor: "Chico Buarque" },
    { civilian: "Tom Jobim", impostor: "Vinicius de Moraes" },
    { civilian: "Elis Regina", impostor: "Milton Nascimento" },
    { civilian: "Gal Costa", impostor: "Maria Bethânia" },
    { civilian: "João Gilberto", impostor: "Tim Maia" },
    { civilian: "Jorge Ben Jor", impostor: "Djavan" },
    { civilian: "Ivete Sangalo", impostor: "Anitta" },
    { civilian: "Ludmilla", impostor: "Thiaguinho" },
    { civilian: "Alcione", impostor: "Samba" }
  ],
  "Novelas": [
    { civilian: "Pantanal", impostor: "Avenida Brasil" },
    { civilian: "A Favorita", impostor: "Cobras & Lagartos" },
    { civilian: "Paraíso Tropical", impostor: "Mulheres Apaixonadas" },
    { civilian: "Renascer", impostor: "O Clone" },
    { civilian: "Laços de Família", impostor: "Terra Nostra" },
    { civilian: "Por Amor", impostor: "Irmãos Coragem" },
    { civilian: "Escrava Isaura", impostor: "Roque Santeiro" },
    { civilian: "Vale Tudo", impostor: "Que Rei Sou Eu?" },
    { civilian: "Dancin' Days", impostor: "Saramandaia" },
    { civilian: "O Bem-Amado", impostor: "Gabriela" },
    { civilian: "Tieta", impostor: "Fera Radical" },
    { civilian: "Malhação", impostor: "Chiquititas" },
    { civilian: "Carrossel", impostor: "Pantanal" }
  ],
  "Brasil e Turismo": [
    { civilian: "Rio de Janeiro", impostor: "São Paulo" },
    { civilian: "Brasília", impostor: "Salvador" },
    { civilian: "Fortaleza", impostor: "Recife" },
    { civilian: "Belo Horizonte", impostor: "Manaus" },
    { civilian: "Curitiba", impostor: "Porto Alegre" },
    { civilian: "Cristo Redentor", impostor: "Pão de Açúcar" },
    { civilian: "Maracanã", impostor: "Copacabana" },
    { civilian: "Amazônia", impostor: "Foz do Iguaçu" },
    { civilian: "Lençóis Maranhenses", impostor: "Chapada Diamantina" },
    { civilian: "Bonito", impostor: "Ouro Preto" },
    { civilian: "Paraty", impostor: "Pelourinho" },
    { civilian: "Teatro Amazonas", impostor: "Congresso Nacional" },
    { civilian: "MASP", impostor: "Rio de Janeiro" }
  ],
  "Marcas Brasileiras": [
    { civilian: "Havaianas", impostor: "Natura" },
    { civilian: "O Boticário", impostor: "Petrobras" },
    { civilian: "Bradesco", impostor: "Itaú" },
    { civilian: "Embraer", impostor: "Vale" },
    { civilian: "Gol", impostor: "Azul" },
    { civilian: "TAM", impostor: "Brahma" },
    { civilian: "Skol", impostor: "Antarctica" },
    { civilian: "Guaraná Jesus", impostor: "Lojas Americanas" },
    { civilian: "Magazine Luiza", impostor: "Pão de Açúcar" },
    { civilian: "Casas Bahia", impostor: "Submarino" },
    { civilian: "Melissa", impostor: "Alpargatas" },
    { civilian: "Globo", impostor: "Record" },
    { civilian: "SBT", impostor: "Havaianas" }
  ]
};

// Retorna uma lista de todas as categorias disponiveis.
export const getCategories = () => Object.keys(wordCategories);

// Seleciona um par de palavras aleatorio baseado na categoria fornecida.
// Se a categoria for "Aleatorio" ou inexistente, escolhe uma categoria aleatoria.
export function getRandomPair(category) {
  let selectedCategory = category;
  const categories = getCategories();

  if (!category || category === "Aleatório" || !wordCategories[category]) {
    selectedCategory = categories[Math.floor(Math.random() * categories.length)];
  }

  const list = wordCategories[selectedCategory];
  const pair = list[Math.floor(Math.random() * list.length)];
  return {
    category: selectedCategory,
    ...pair
  };
}
