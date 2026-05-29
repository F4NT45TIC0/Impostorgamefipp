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
