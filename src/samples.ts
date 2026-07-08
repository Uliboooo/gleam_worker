export interface Sample {
  title: string;
  description: string;
  code: string;
}

export const DEFAULT_CODE = `import gleam/io

pub fn main() {
  io.println("Hello from Gleam! ✨")
}
`;

export const samples: Sample[] = [
  {
    title: "Hello World",
    description: "まずはここから",
    code: DEFAULT_CODE,
  },
  {
    title: "パターンマッチ",
    description: "case 式で値を分解する",
    code: `import gleam/io
import gleam/int

pub fn main() {
  list_size([1, 2, 3])
  |> describe
  |> io.println
}

fn list_size(items: List(Int)) -> Int {
  case items {
    [] -> 0
    [_, ..rest] -> 1 + list_size(rest)
  }
}

fn describe(n: Int) -> String {
  case n {
    0 -> "空っぽ"
    1 -> "ひとつだけ"
    _ -> int.to_string(n) <> " 個あります"
  }
}
`,
  },
  {
    title: "パイプライン",
    description: "|> でデータを流す",
    code: `import gleam/io
import gleam/int
import gleam/list

pub fn main() {
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  |> list.filter(fn(n) { n % 2 == 0 })
  |> list.map(fn(n) { n * n })
  |> list.fold(0, fn(acc, n) { acc + n })
  |> int.to_string
  |> io.println
}
`,
  },
  {
    title: "Result 型",
    description: "失敗しうる処理を型で扱う",
    code: `import gleam/io
import gleam/int
import gleam/result

pub fn main() {
  case divide(10, 2) |> result.try(fn(n) { divide(n, 0) }) {
    Ok(n) -> io.println("結果: " <> int.to_string(n))
    Error(message) -> io.println("エラー: " <> message)
  }
}

fn divide(a: Int, b: Int) -> Result(Int, String) {
  case b {
    0 -> Error("0 では割れません")
    _ -> Ok(a / b)
  }
}
`,
  },
  {
    title: "再帰",
    description: "末尾再帰でフィボナッチ",
    code: `import gleam/io
import gleam/int
import gleam/list

pub fn main() {
  list.range(0, 10)
  |> list.map(fib)
  |> list.map(int.to_string)
  |> list.each(io.println)
}

fn fib(n: Int) -> Int {
  fib_loop(n, 0, 1)
}

fn fib_loop(n: Int, a: Int, b: Int) -> Int {
  case n {
    0 -> a
    _ -> fib_loop(n - 1, b, a + b)
  }
}
`,
  },
  {
    title: "カスタム型",
    description: "独自の型を定義する",
    code: `import gleam/io

pub type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
}

pub fn main() {
  io.println(describe(Circle(1.0)))
  io.println(describe(Rectangle(3.0, 4.0)))
}

fn describe(shape: Shape) -> String {
  case shape {
    Circle(_) -> "まる"
    Rectangle(w, h) if w == h -> "ましかく"
    Rectangle(_, _) -> "しかく"
  }
}
`,
  },
  {
    title: "文字列処理",
    description: "gleam/string の基本",
    code: `import gleam/io
import gleam/string
import gleam/list

pub fn main() {
  "gleam is fun"
  |> string.split(" ")
  |> list.map(string.capitalise)
  |> string.join(" ")
  |> io.println

  io.println(string.reverse("流れ星"))
}
`,
  },
  {
    title: "ラベル付き引数",
    description: "読みやすい関数呼び出し",
    code: `import gleam/io
import gleam/int

pub fn main() {
  replace_range(in: 100, from: 0, to: 42)
  |> int.to_string
  |> io.println
}

fn replace_range(in value: Int, from low: Int, to high: Int) -> Int {
  int.clamp(value, low, high)
}
`,
  },
  {
    title: "ジェネリクス",
    description: "型変数を使った汎用関数",
    code: `import gleam/io
import gleam/int

pub fn main() {
  let #(a, b) = swap(#("答え", 42))
  io.println(int.to_string(b) <> " が " <> a)
}

fn swap(pair: #(a, b)) -> #(b, a) {
  let #(x, y) = pair
  #(y, x)
}
`,
  },
  {
    title: "use 式",
    description: "コールバックを平らに書く",
    code: `import gleam/io
import gleam/int
import gleam/result

pub fn main() {
  let sum = {
    use a <- result.try(int.parse("12"))
    use b <- result.try(int.parse("30"))
    Ok(a + b)
  }
  case sum {
    Ok(n) -> io.println("合計: " <> int.to_string(n))
    Error(_) -> io.println("数値になりませんでした")
  }
}
`,
  },
];
