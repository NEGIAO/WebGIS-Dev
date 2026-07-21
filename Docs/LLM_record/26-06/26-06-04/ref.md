Axios.CancelToken
axios对象有一个属性叫CancelToken，该属性提供了中断已经发出去的请求的方式。具体使用方式有两种：
方式一：执行器模式
js 体验AI代码助手 代码解读复制代码<script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
<script>
  const CancelTokenFunc = axios.CancelToken;
  let cancel;
​
  // 发送请求
  axios
    .get("https://jsonplaceholder.typicode.com/todos/1", {
      cancelToken: new CancelTokenFunc(function executor(c) {
        // 将 cancel 函数赋值给外部变量
        cancel = c;
      }),
    })
    .catch((error) => {
       console.log(error.message);
    });
​
  // 取消请求
  setTimeout(() => {
    cancel("Operation canceled by the user.");
  }, 1000);
</script>

在第4行中，我们先获取一个中断构造函数CancelTokenFunc，我们在第10行中用这个构造函数new出一个实例赋值给get请求的参数cancelToken字段。
在调用CancelTokenFunc构造函数new出一个实例的时候，我们传入了一个执行器函数，该执行器会接受一个参数，这个参数就是用来控制中断请求的取消函数，接着我们把该参数函数赋值给外部变量，这样就可以在外部需要的时候执行中断请求的操作。
执行上述代码，将浏览器调整成低速3G模式后，执行结果如下：

并在控制台中输入了如下信息：
csharp 体验AI代码助手 代码解读复制代码Operation canceled by the user.

方式二：令牌模式
js 体验AI代码助手 代码解读复制代码// 创建一个 CancelToken 源
const CancelTokenFunc = axios.CancelToken;
const { token, cancel } = CancelTokenFunc.source();
​
// 发送请求
axios
  .get("https://jsonplaceholder.typicode.com/todos/1", {
    cancelToken: token,
  })
  .catch((error) => {
    console.log(error.message);
  });
​
// 取消请求
setTimeout(() => {
  cancel("Operation canceled by the user.");
}, 1000);

在第3行代码中，用CancelTokenFunc的source方法生成一个取消令牌源，并从取消令牌源中解构出token和cancel字段，然后在GET请求中将取消令牌源的token传递给cancelToken，接着在外部调用请求令牌源的cancel方法来取消请求。
执行结果和上面那种方式一样，就不再赘述了。
相比于方式一的执行器模式，方式二的令牌模式更简单易懂，另外需要注意一下，每次调用CancelTokenFunc.source()生成的令牌源是不一样的。
AbortController
AbortController是一个Web API，用于控制和管理可中止的异步操作，例如 fetch 请求、DOM 操作。接下来我们看看怎么用AbortController来中止请求。
html 体验AI代码助手 代码解读复制代码<!DOCTYPE html>
<html>
  <head>
    <title>中断请求demo</title>
  </head>
  <body>
    <script>
      // 创建一个 AbortController 信号源
      const controller = new AbortController();
      const { signal } = controller;
​
      // 发送请求
      fetch("https://jsonplaceholder.typicode.com/todos/1", {
        signal,
      }).catch((error) => {
        console.log(error);
      });
​
      // 取消请求
      setTimeout(() => {
        controller.abort("Operation canceled by the user.");
      }, 1000);
    </script>
  </body>
</html>

在第9行中，我们创建了一个AbortController信号源，在fetch请求的时候传递一个信号给请求的signal参数，之后便可以在请求的外部通过调用信号源的abort方法来取消请求。
这个API的用法其实和Axios.CancelToken的令牌模式一样，但是该API会有兼容性问题，需要通过引入yet-another-abortcontroller-polyfill或者abortcontroller-polyfill来解决。

令牌中断请求原理
中断请求的原理其实很简单，只要监听到调用取消函数，就执行xhr.abort()(其中，xhr是XMLHttpRequest的实例)中断请求即可，值得探究的是令牌中断请求的原理，也就是token和cancel之间的映射关系是怎么建立的。
首先我们需要模拟下请求取消的过程，其代码如下：
js 体验AI代码助手 代码解读复制代码function fetchData(url, options = {}) {
  const { cancelToken } = options;
​
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
​
    // 监听请求状态变化，处理请求的常规逻辑
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.responseText);
        }
      }
    };
​
    // 监听取消请求
    if (cancelToken) {
      // ... 需要在外界调用cancel请求的时候，调用xhr.abort()方法中止请求，
      // 并在这里调用reject函数将Promise对象的状态改成rejected
    }
​
    xhr.send();
  });
}
fetchData("https://jsonplaceholder.typicode.com/todos/1").then((res) => {
  console.log(res);
});

上述代码中，我们在fetchData中返回一个Promise对象，并在Promise对象新建一个原生的XMLHttpRequest对象。
其中的关键代码，在于监听取消请求这个判断里。
在监听取消请求这个判断中，我们只有一个cancelToken属性，这个属性需要在外界执行cancel时调用xhr.abort()来中止已经发出去的请求，同时将fetchData内的Promise对象的状态改成Rejected。
因此，cancelToken需要携带一个回调属性，在外界执行cancel方法时触发回调。
自然而然的，我们就想到，能否给cancelToken挂载一个Promise实例的属性，然后将这个Promise属性的resolved方法传递给cancel，这样，当执行cancel函数的时候，其实就是执行resolve()，从而改变Promise实例的状态，我们就能在Promise实例的then方法中执行需要的操作。
也就是说，监听取消请求需要被设计成这样：
js 体验AI代码助手 代码解读复制代码function fetchData(url, options = {}) {
  const { cancelToken } = options;
​
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
​
    // 监听请求状态变化，处理请求的常规逻辑
    // 其他代码
​
     // 监听取消请求
    if (cancelToken) {
      // 需要在外界调用cancel请求的时候，调用xhr.abort()方法中止请求 
      // 并调用reject函数将Promise对象的状态改成rejected
      cancelToken.promise.then((msg) => {
        xhr.abort();
        reject(new Error(msg));
      })
    }。
    xhr.send();
  });
}
​

其中，cancelToken.promise是一个Promise实例的属性。
现在，我们继续设计构造函数CancelToken的实现，这个函数需要有一个source方法，该方法返回两个属性，一个是token，一个是cancel函数，其中token应该有一个promise属性，该属性是一个Promise实例，该实例的resolved方法将传递给cancel函数。
js 体验AI代码助手 代码解读复制代码function CancelToken() {}
CancelToken.source = function () {
  let cancel;
  const token = {
    promise: new Promise((resolve) => {cancel = resolve})
  };
  return {
    cancel,
    token,
  };
};

上述代码里，我们将token声明为对象，并在第5行中给token添加一个promise属性，该属性是一个Promise实例，并且将Promise实例的resolve方法传递给了cancel变量，这样，当调用执行cancel()的时候，就是在执行resolve()，token的promise属性就能触发then回调函数。
这样，我们就实现了令牌中断请求的要求，并将cancel和token关联起来了。到这里，我们就明白每一次调用source方法生成的cancel和token为啥能一一对应了。
执行器模式原理
CancelToken不仅支持令牌中断模式，还支持执行器中断模式，而执行器模式是需要通过CancelToken的构造函数实现。
该构造函数的实现有三个细节需要注意：

首先，该构造函数同样需要给实例对象挂载一个promise属性，该属性是一个Promise实例。这样才能支持在token.promise.then回调里执行取消操作。
其次，需要接受一个执行器函数作为入参，
最后，作为入参的执行器，它本身也有入参，它的入参是一个方法，在这个方法调用的时候，执行promise属性的resolve方法，这样才能触发toekn.promise.then回调。

带着上面三个细节，我们来尝试实现CancelToken构造函数：
js 体验AI代码助手 代码解读复制代码function CancelToken(executor) {
  let resolvePromise;
  this.promise = new Promise((resolve) => { resolvePromise = resolve;});
  
  executor(function c() {
    resolvePromise();
  })
}

上述代码中，我们依照三个细节，来一一解读下：

对于第一个细节，我们在第3行代码中，我们在this上挂载了promise属性，该属性是一个Promise对象，同时，为了达到在外部触发该Promise对象的状态变更，我们将其resolve方法保存给了外部变量resolvePromise。
对于第二个细节，我们在第1行声明构造函数的时候就声明了executor入参。
对于第三个细节，我们在第5行中，在执行器调用的时候传入一个函数作为入参，同时在函数内部执行resolvePromise()触发this.promise状态变更。

这样，我们就实现了简单的CancelToken的构造函数。
两个模式结合
接下来我们将执行器模式结合令牌中断模式的代码一起看下：
js 体验AI代码助手 代码解读复制代码function CancelToken(executor) {
  let resolvePromise;
  this.promise = new Promise((resolve) => { resolvePromise = resolve;});
  
  executor(function c() {
    resolvePromise();
  })
}
CancelToken.source = function () {
  let cancel;
  const token = {
    promise: new Promise((resolve) => {cancel = resolve})
  };
  return {
    cancel,
    token,
  };
};

结合令牌中断模式和执行器中断模式的代码一起看后，我们发现，第3行中给this.promise赋值了一个Promies实例，第11行中token需要的promise属性，也是一个Promise实例，因此，这两个能优化一下：
js 体验AI代码助手 代码解读复制代码function CancelToken(executor) {
  let resolvePromise;
  this.promise = new Promise((resolve) => { resolvePromise = resolve;});
  
  executor(function c() {
    resolvePromise();
  })
}
CancelToken.source = function () {
  let cancel;
  const token = new CancelToken(function executor(c) {
    cancel = c;
  });
  return {
    cancel,
    token,
  };
};

上述代码中，我们修改了第11行代码，给token赋值为CancelToken实例对象，并在实例化的时候传入一个执行器函数executor，该执行器函数接受一个参数c，并将c赋值给了外部变量cancel属性，这样，执行cancel的流程就变成下面这样：

调用执行第15行返回的cancel()函数。
cancel函数来自于第11行中executor的入参c。
第11行中的入参c来自于第5行执行executor时的赋值。
最终，执行cancel()的时候，就会执行第6行中的resolvePromise()方法，从而改变promise属性的状态，触发then回调函数。

测试手写版CancelToken
接下来，使用我们实现的CancelToken来试试取消网络请求，
方式一：执行器模式示例如下：
js 体验AI代码助手 代码解读复制代码<script>
  function CancelToken(executor) {
    let resolvePromise;
    this.promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    executor(function c() {
      resolvePromise();
    });
  }
  CancelToken.source = function () {
    let cancel;
    const token = new CancelToken(function executor(c) {
      cancel = c;
    });
    return {
      cancel,
      token,
    };
  };

  function fetchData(url, options = {}) {
    const { cancelToken } = options;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url);

      // 监听请求状态变化，处理请求的常规逻辑
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.responseText);
          }
        }
      };

      // 监听取消请求
      if (cancelToken) {
        cancelToken.promise.then((msg) => {
          xhr.abort();
          reject(`Request cancelled: ${msg}`);
        });
      }

      xhr.send();
    });
  }

  let cancel;

  fetchData("https://jsonplaceholder.typicode.com/todos/1", {
    cancelToken: new CancelToken((c) => {
      cancel = c;
    }),
  }).catch((e) => {
    console.log(e);
  });

  setTimeout(() => {
    cancel("取消请求");
  }, 500);
</script>

将网速调整成慢速3G后执行后效果如下：

控制台打印的结果，有个undefined

方式二：令牌模式示例如下：
js 体验AI代码助手 代码解读复制代码<script>
  function CancelToken(executor) {
    // ...
  }
  CancelToken.source = function () {
    // ...
  };

  function fetchData(url, options = {}) {
	  // ...
  }
  const { token, cancel } = CancelToken.source();

  fetchData("https://jsonplaceholder.typicode.com/todos/1", {
    cancelToken: token,
  }).catch((e) => {
    console.log(e);
  });

  setTimeout(() => {
    cancel("取消请求");
  }, 500);
</script>

执行结果同执行器模式，这里就不截图了。
优化
我们手写版的CancelToken已经实现了基本的功能，也就是取消请求，但是有个问题，那就是调用cancel("取消请求")里，参数没有传递到给cancelToken.promise.then回调函数，所以打印出来的结果里有个undefined。因此，我们需要稍微优化下CancelToken，补齐参数的传递。
优化的方式也很简单，取消函数cancel的入参，会通过形参赋值的方式传递给c的入参，因此我们只需要拿c的入参给resolve就行了。具体如下：
js 体验AI代码助手 代码解读复制代码function CancelToken(executor) {
  let resolvePromise;
  this.promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  executor(function c(msg) {
    resolvePromise(msg); // 这里将cancel的入参传递给resolve
  });
}

这样，就完成了参数的传递。
还有一点需要注意，那就是cancel可能会被多次调用，我们需要在第二次之后的调用直接结束。这里我们就可以在第一次调用cancel的时候用传入的参数做个标记，有参数则代表已经调用过cancel，后续再调用cancel时直接返回，这样就能防止多次调用。
js 体验AI代码助手 代码解读复制代码function CancelToken(executor) {
  let resolvePromise;
  this.promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });
	
  const token = this;
  executor(function c(msg) {
    if (token.reason) {
      return; // 如果已经有了reason，说明之前调用过cancel，后续再次调用直接接结束
    }
    token.reason = msg || 'cancel request';
    resolvePromise(token.reason); // 这里将cancel的入参传递给resolve
  });
}

上述代码中，我们在executor的外部，也就是第7行先保存this指向为token，然后在第9行中判断是token是否存在取消原因字段reason，有的话，说明之前已经调用过cancel了，这时再次调用cancel就是重复执行cancel方法，我们可以直接retuen从而避免重复取消请求。
在第12行中，我们给token.reason赋了一个默认值cancel request，因为第一次调用cancel时有可能没传参。
这样，我们就完成了CancelToken的手写版优化，完整代码如下：
js 体验AI代码助手 代码解读复制代码function CancelToken(executor) {
  let resolvePromise;
  this.promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });
	
  const token = this;
  executor(function c(msg) {
    if (token.reason) {
      return;
    }
    token.reason = msg || 'cancel request';
    resolvePromise(token.reason);
  });
}
CancelToken.source = function () {
  let cancel;
  const token = new CancelToken(function executor(c) {
    cancel = c;
  });
  return {
    cancel,
    token,
  };
};
